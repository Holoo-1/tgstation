import { sortBy } from 'common/collections';
import {
  Component,
  createRef,
  Dispatch,
  FC,
  RefObject,
  SetStateAction,
  useCallback,
  useState,
} from 'react';
import {
  Box,
  Button,
  Dropdown,
  InfinitePlane,
  LabeledList,
  Modal,
  Section,
  Slider,
  Stack,
  Tooltip,
} from 'tgui-core/components';
import { flow } from 'tgui-core/fp';
import { classes } from 'tgui-core/react';

import { resolveAsset } from '../../assets';
import { useBackend } from '../../backend';
import { Window } from '../../layouts';
import { Connection, Connections, Position } from '../common/Connections';
import { MOUSE_BUTTON_LEFT, noop } from '../IntegratedCircuit/constants';
import planeInfoText from './planeInfoText';
import {
  AssocConnected,
  AssocPlane,
  Connected,
  ConnectionDirection,
  ConnectionRef,
  ConnectionType,
  Filter,
  Plane,
  PlaneDebugData,
  PlaneMasterProps,
  PortProps,
} from './types';

// Stolen wholesale from fontcode
function textWidth(text: string, font: string, fontsize: number): number {
  // default font height is 12 in tgui
  font = fontsize + 'x ' + font;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.font = font;
  return ctx.measureText(text).width;
}

const planeToPosition = function (plane: Plane, index, is_incoming): Position {
  return {
    x: is_incoming ? plane.x : plane.x + plane.size_x,
    y:
      13 +
      plane.y +
      plane.step_size * index +
      (plane.step_size - plane.step_size / 3),
  };
};

// Takes a plane, returns the amount of node space it will need
function getPlaneNodeHeight(plane: Plane): number {
  return Math.max(
    plane.incoming_relays.length + plane.incoming_filters.length,
    plane.outgoing_relays.length + plane.outgoing_filters.length,
  );
}

function sortConnectionRefs(
  refs: ConnectionRef[],
  direction: ConnectionDirection,
  connectSources: AssocConnected,
) {
  refs = sortBy(refs, (connection: ConnectionRef) => connection.sort_by);
  refs.map((connection, index) => {
    let connectSource = connectSources[connection.ref];
    if (direction === ConnectionDirection.Outgoing) {
      connectSource.source_index = index;
    } else if (direction === ConnectionDirection.Incoming) {
      connectSource.target_index = index;
    }
  });
  return refs;
}

function addConnectionRefs(
  read_from: string[],
  add_type: ConnectionDirection,
  add_to: ConnectionRef[],
  reference: AssocConnected,
  plane_info: AssocPlane,
) {
  for (const ref of read_from) {
    const connected = reference[ref];
    let our_plane; // If we're incoming, use the target ref, and vis versa
    if (add_type === ConnectionDirection.Incoming) {
      our_plane = plane_info[connected.source_ref];
    } else if (add_type === ConnectionDirection.Outgoing) {
      our_plane = plane_info[connected.target_ref];
    }
    add_to.push({
      ref: ref,
      sort_by: our_plane.plane,
    });
  }
}

// Takes a list of planes, uses the depth stack to position them
const positionPlanes = (
  connectSources: AssocConnected,
  data: PlaneDebugData,
) => {
  const { plane_info, relay_info, filter_connect, depth_stack } = data;

  // First, we concatinate our connection sources
  // We need them in one list partly for later purposes
  // But also so we can set their source/target index nicely

  for (const ref of Object.keys(relay_info)) {
    let connection_source: Connected = relay_info[ref];
    connection_source.connect_type = ConnectionType.Relay;
    connection_source.connect_color = 'blue';
    connectSources[ref] = connection_source;
  }
  for (const ref of Object.keys(filter_connect)) {
    let connection_source: Connected = filter_connect[ref];
    connection_source.connect_type = ConnectionType.Filter;
    connection_source.connect_color = 'purple';
    connectSources[ref] = connection_source;
  }

  for (const plane_ref of Object.keys(plane_info)) {
    let our_plane = plane_info[plane_ref];
    const incoming_conct: ConnectionRef[] = [] as any;
    const outgoing_conct: ConnectionRef[] = [] as any;
    addConnectionRefs(
      our_plane.incoming_relays,
      ConnectionDirection.Incoming,
      incoming_conct,
      relay_info,
      plane_info,
    );
    addConnectionRefs(
      our_plane.incoming_filters,
      ConnectionDirection.Incoming,
      incoming_conct,
      filter_connect,
      plane_info,
    );
    addConnectionRefs(
      our_plane.outgoing_relays,
      ConnectionDirection.Outgoing,
      outgoing_conct,
      relay_info,
      plane_info,
    );
    addConnectionRefs(
      our_plane.outgoing_filters,
      ConnectionDirection.Outgoing,
      outgoing_conct,
      filter_connect,
      plane_info,
    );
    our_plane.incoming_connections = sortConnectionRefs(
      incoming_conct,
      ConnectionDirection.Incoming,
      connectSources,
    );
    our_plane.outgoing_connections = sortConnectionRefs(
      outgoing_conct,
      ConnectionDirection.Outgoing,
      connectSources,
    );
  } // First we sort by the plane of each member,
  // then we sort by the plane of each member's head
  // This way we get a nicely sorted list
  // and get rid of the now unneeded parent refs

  const stack = depth_stack.map((layer) =>
    flow([
      (planes) => sortBy(planes, (plane: string) => plane_info[plane].plane),
      (planes) =>
        sortBy(planes, (plane: string) => {
          const read_from = plane_info[layer[plane]];
          if (!read_from) {
            return 0;
          }
          return read_from.plane;
        }),
    ])(Object.keys(layer)),
  );

  let base_x = 0;
  let longest_name = 0;
  let tallest_stack = 0;
  for (const layer of stack) {
    base_x += longest_name;
    base_x += 150;
    let new_longest = 0;
    let last_node_len = 0;
    let base_y = 0;
    for (const plane_ref of layer) {
      const old_y = base_y;
      const plane = plane_info[plane_ref]; // - because we want to work backwards rather then forwards
      plane.x = -base_x; // I am assuming the height of a plane master with two connections looks
      // like 50% name 50% (two) nodes
      base_y += 45;
      // One extra for the relay add button
      base_y += 19 * (last_node_len + 1);
      // We need to know how large node steps are for later
      plane.step_size = 19;
      plane.y = base_y;
      const width = textWidth(plane.name, '', 16) + 30;
      plane.size_x = width;
      plane.size_y = old_y - base_y;
      new_longest = Math.max(new_longest, width);
      last_node_len = getPlaneNodeHeight(plane);
    }
    longest_name = new_longest;
    tallest_stack = Math.max(tallest_stack, base_y);
  } // Now that we've got everything stacked, we need to center it

  for (const layer of stack) {
    const last_ref = layer[layer.length - 1];
    const last_plane = plane_info[last_ref];
    const delta_tall = tallest_stack - last_plane.y; // Now that we know how "off" our height is, we can correct it
    // We halve because otherwise this looks dumb
    const offset = delta_tall / 2;
    for (const plane_ref of layer) {
      const plane = plane_info[plane_ref];
      plane.y += offset;
    }
  }
};

function arrayRemove(arr: any, value) {
  return arr.filter((element) => element !== value);
}

export const PlaneMasterDebug: FC = () => {
  const { act, data } = useBackend<PlaneDebugData>();
  const { plane_info, mob_name } = data;
  const [connectSources, setConnectSouces] = useState<AssocConnected>({});

  positionPlanes(connectSources, data);
  const connections: Connection[] = [];

  const handlePortClick = useCallback(
    (
      connection: Connected,
      isOutput: boolean,
      event: React.MouseEvent<HTMLElement>,
    ) => {
      if (event.button !== MOUSE_BUTTON_LEFT) {
        return;
      }

      event.preventDefault();
      if (connection.connect_type === ConnectionType.Relay) {
        // Close the connection
        act('disconnect_relay', {
          source: connection.source_ref,
          target: connection.target_ref,
        });
        let source_plane = plane_info[connection.source_ref];
        let target_plane = plane_info[connection.source_ref];
        if (source_plane && target_plane) {
          // check if planes exist before modifying
          source_plane.outgoing_relays = arrayRemove(
            source_plane.outgoing_relays,
            connection.our_ref,
          );
          target_plane.incoming_relays = arrayRemove(
            target_plane.incoming_relays,
            connection.our_ref,
          );
        }
      } else if (connection.connect_type === ConnectionType.Filter) {
        // Close the connection
        const filter = connection as Filter & Connected;
        act('disconnect_filter', {
          target: filter.target_ref,
          name: filter.name,
        });
        let source_plane = plane_info[connection.source_ref];
        let target_plane = plane_info[connection.source_ref];
        if (source_plane && target_plane) {
          // check if planes exist before modifying
          source_plane.outgoing_filters = arrayRemove(
            source_plane.outgoing_filters,
            connection.our_ref,
          );
          target_plane.incoming_filters = arrayRemove(
            target_plane.incoming_filters,
            connection.our_ref,
          );
        }
      }
    },
    [act, plane_info],
  ); // Dependencies for useCallback

  for (const ref of Object.keys(connectSources)) {
    const connect = connectSources[ref];
    const source_plane = plane_info[connect.source_ref];
    const target_plane = plane_info[connect.target_ref];
    if (source_plane && target_plane) {
      // Check if planes exist before using them
      connections.push({
        color: connect.connect_color,
        from: planeToPosition(source_plane, connect.source_index, false),
        to: planeToPosition(target_plane, connect.target_index, true),
        ref: ref,
      });
    }
  }

  const portClickHandler = useCallback(
    (connection, isOutput, event) => {
      handlePortClick(connection, isOutput, event);
    },
    [handlePortClick],
  ); // useCallback for handler

  return (
    <Window width={1200} height={800} title={'Plane Debugging: ' + mob_name}>
      <Window.Content
        style={{
          backgroundImage: 'none',
        }}
      >
        <InfinitePlane
          width="100%"
          height="100%"
          backgroundImage={resolveAsset('grid_background.png')}
          imageWidth={900}
          initialLeft={800}
          initialTop={-740}
        >
          {Object.keys(plane_info).map(
            (plane_key, index) =>
              plane_key && (
                <PlaneMaster
                  key={index}
                  {...plane_info[plane_key]}
                  our_plane={plane_info[plane_key]}
                  connected_list={connectSources}
                  onPortMouseDown={portClickHandler}
                  act={act}
                />
              ),
          )}
          <Connections connections={connections} />
        </InfinitePlane>
        <DrawAbovePlane />
      </Window.Content>
    </Window>
  );
};

const PlaneMaster: FC<PlaneMasterProps> = (props) => {
  const {
    name,
    incoming_connections,
    outgoing_connections,
    connected_list,
    our_plane,
    x,
    y,
    onPortMouseDown = noop,
    act = noop,
    ...rest
  } = props;
  const [showAdd, setShowAdd] = useState(false);
  const [currentPlane, setCurrentPlane] = useState({});
  const [readPlane, setReadPlane] = useState(''); // Assigned onto the ports

  const PortOptions = {
    onPortMouseDown: (connection, isOutput, e) =>
      onPortMouseDown(connection, isOutput, e),
  };
  return (
    <Box position="absolute" left={`${x}px`} top={`${y}px`} {...rest}>
      <Box
        backgroundColor={our_plane.intended_hidden ? '#191919' : '#000000'}
        py={1}
        px={1}
        className="ObjectComponent__Titlebar"
      >
        {name}
        <Button
          ml={2}
          icon="pager"
          tooltip="Inspect and edit this plane"
          onClick={() => setReadPlane(our_plane.our_ref)}
        />
      </Box>
      <Box
        className={
          our_plane.intended_hidden
            ? 'ObjectComponent__Greyed_Content'
            : 'ObjectComponent__Content'
        }
        py={1}
        px={1}
      >
        <Stack>
          <Stack.Item>
            <Stack vertical fill>
              {incoming_connections.map((con_ref, portIndex) => (
                <Stack.Item key={portIndex}>
                  <Port
                    act={act}
                    connection={connected_list[con_ref.ref]}
                    {...PortOptions}
                  />
                </Stack.Item>
              ))}
            </Stack>
          </Stack.Item>
          <Stack.Item ml={5} width="100%">
            <Stack vertical>
              {outgoing_connections.map((con_ref, portIndex) => (
                <Stack.Item key={portIndex}>
                  <Port
                    act={act}
                    connection={connected_list[con_ref.ref]}
                    {...PortOptions}
                    isOutput
                  />
                </Stack.Item>
              ))}
              <Stack.Item align="flex-end">
                <Button
                  icon="plus"
                  onClick={() => {
                    setShowAdd(true);
                    setCurrentPlane(our_plane);
                  }}
                  right="-4px"
                  tooltip="Connect to another plane"
                />
              </Stack.Item>
            </Stack>
          </Stack.Item>
        </Stack>
      </Box>
    </Box>
  );
};

class Port extends Component<PortProps> {
  // Ok so like, we're basically treating iconRef as a string here
  // Mostly so svg can work later. You're really not supposed to do this.
  // Should really be a RefObject<Element>
  // But it's how it was being done in circuit code, so eh
  iconRef: RefObject<SVGCircleElement> | RefObject<HTMLSpanElement> | any;

  constructor(props) {
    super(props);
    this.iconRef = createRef();
    this.handlePortMouseDown = this.handlePortMouseDown.bind(this);
  }

  handlePortMouseDown(e) {
    const {
      connection,
      isOutput,
      onPortMouseDown = noop,
    } = this.props as PortProps;
    onPortMouseDown(connection, isOutput, e);
  }

  render() {
    const { connection, isOutput, ...rest } = this.props as PortProps;

    return (
      <Stack {...rest} justify={isOutput ? 'flex-end' : 'flex-start'}>
        <Stack.Item>
          <Box
            className={classes(['ObjectComponent__Port'])}
            onMouseDown={this.handlePortMouseDown}
            textAlign="center"
          >
            <svg
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
              }}
              viewBox="0, 0, 100, 100"
            >
              <circle
                stroke={connection.connect_color}
                strokeDasharray={`${100 * Math.PI}`}
                strokeDashoffset={-100 * Math.PI}
                className={`color-stroke-${connection.connect_color}`}
                strokeWidth="50px"
                cx="50"
                cy="50"
                r="50"
                fillOpacity="0"
                transform="rotate(90, 50, 50)"
              />
              <circle
                ref={this.iconRef}
                cx="50"
                cy="50"
                r="50"
                className={`color-fill-${connection.connect_color}`}
              />
            </svg>
            <span ref={this.iconRef} className="ObjectComponent__PortPos" />
          </Box>
        </Stack.Item>
      </Stack>
    );
  }
}

const DrawAbovePlane: FC = (props) => {
  const [showAdd, setShowAdd] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [readPlane, setReadPlane] = useState('');

  const { act, data } = useBackend<PlaneDebugData>(); // Plane groups don't use relays right now, because of a byond bug
  // This exists mostly so enabling viewing them is easy and simple
  const { enable_group_view, mob_ref, our_ref } = data;
  const isForeignMob = has_foreign_mob(mob_ref, our_ref);
  return (
    <>
      {!!readPlane && (
        <PlaneWindow
          readPlaneRef={{ value: readPlane, setReadPlane }}
          setShowInfo={setShowInfo}
        />
      )}
      {!readPlane && (
        <>
          <InfoButton isForeignMob={isForeignMob} setShowInfo={setShowInfo} />
          <MobResetButton isForeignMob={isForeignMob} />
          <ToggleMirror />
          <VVButton />
          <RebuildButton />
        </>
      )}
      {!!enable_group_view && <GroupDropdown />}
      {!!showAdd && <AddModal setShowAdd={setShowAdd} />}
      {!!showInfo && <InfoModal setShowInfo={setShowInfo} />}
    </>
  );
};

interface PlaneWindowProps {
  readPlaneRef: {
    value: string;
    setReadPlane: Dispatch<SetStateAction<string>>;
  };
  setShowInfo: Dispatch<SetStateAction<boolean>>;
}

const PlaneWindow: FC<PlaneWindowProps> = (props) => {
  const { readPlaneRef, setShowInfo } = props;
  const { data, act } = useBackend<PlaneDebugData>();
  const { plane_info } = data;
  const { value: readPlane, setReadPlane } = readPlaneRef;

  const workingPlane: Plane = plane_info[readPlane];
  if (!workingPlane) {
    return null; // Handle case where workingPlane is not found
  } // NOT sanitized, since this would only be editable by admins or coders

  const doc_html = {
    __html: workingPlane.documentation,
  };

  const setAlpha = useCallback(
    (event, value) =>
      act('set_alpha', {
        edit: workingPlane.our_ref,
        alpha: value,
      }),
    [act, workingPlane.our_ref],
  ); // useCallback for handler, include dependencies

  return (
    <Section
      top="27px"
      right="0px"
      width="40%"
      height="100%"
      position="absolute"
      backgroundColor="#000000"
      title={'Plane Master: ' + workingPlane.name}
      buttons={
        <>
          <ClosePlaneWindow setReadPlane={setReadPlane} />
          <InfoButton no_position setShowInfo={setShowInfo} />
          <MobResetButton no_position />
          <ToggleMirror no_position />
          <VVButton no_position />
          <RebuildButton no_position />
        </>
      }
    >
      <Section title="Information">
        <Box dangerouslySetInnerHTML={doc_html} />
        <LabeledList>
          <LabeledList.Divider />
          <Tooltip
            content="Any atoms in the world with the same plane will be drawn to this plane master"
            position="right"
          >
            <LabeledList.Item label="Plane">
              {workingPlane.plane}
            </LabeledList.Item>
          </Tooltip>
          <Tooltip
            content="You can think of this as the 'layer' this plane is on. We make duplicates of each plane for each layer, so we can make multiz work"
            position="right"
          >
            <LabeledList.Item label="Offset">
              {workingPlane.offset}
            </LabeledList.Item>
          </Tooltip>
          <Tooltip
            content="Render targets can be used to either reference or draw existing drawn items on the map. For plane masters, we use these for either relays (the blue lines), or filters (the pink ones)"
            position="right"
          >
            <LabeledList.Item label="Render Target">
              {workingPlane.render_target || '""'}
            </LabeledList.Item>
          </Tooltip>
          <Tooltip
            content="Defines how this plane draws to the things it is relay'd onto. Check the byond ref for more details"
            position="right"
          >
            <LabeledList.Item label="Blend Mode">
              {workingPlane.blend_mode}
            </LabeledList.Item>
          </Tooltip>
          <Tooltip
            content="If this is 1, the plane master is being forced to hide from its mob. This is most often done as an optimization tactic, since some planes only rarely need to be used"
            position="right"
          >
            <LabeledList.Item label="Forced Hidden">
              {workingPlane.intended_hidden}
            </LabeledList.Item>
          </Tooltip>
        </LabeledList>
      </Section>
      <Section title="Visuals">
        <Button
          tooltip="Open this plane's VV menu"
          onClick={() =>
            act('vv_plane', {
              edit: workingPlane.our_ref,
            })
          }
        >
          View Variables
        </Button>
        <Button
          tooltip="Apply and edit effects over the whole plane"
          onClick={() =>
            act('edit_filters', {
              edit: workingPlane.our_ref,
            })
          }
        >
          Edit Filters
        </Button>
        <Button
          tooltip="Modify how different color components map to the final plane"
          onClick={() =>
            act('edit_color_matrix', {
              edit: workingPlane.our_ref,
            })
          }
        >
          Edit Color Matrix
        </Button>
        <Slider
          value={workingPlane.alpha}
          minValue={0}
          maxValue={255}
          step={1}
          stepPixelSize={1.9}
          onDrag={setAlpha}
          onChange={setAlpha}
        >
          Alpha ({workingPlane.alpha})
        </Slider>
      </Section>
    </Section>
  );
};

interface InfoButtonProps {
  setShowInfo: Dispatch<SetStateAction<boolean>>;
  no_position?: boolean;
  isForeignMob?: boolean;
}

const InfoButton: FC<InfoButtonProps> = (props) => {
  const { no_position, isForeignMob, setShowInfo } = props;

  return (
    <Button
      top={no_position ? '' : '30px'}
      right={no_position ? '' : isForeignMob ? '100px' : '76px'}
      position={no_position ? '' : 'absolute'}
      icon="exclamation"
      onClick={() => setShowInfo(true)}
      tooltip="Info about what this window is/why it exists"
    />
  );
};

interface MobResetButtonProps {
  no_position?: boolean;
  isForeignMob?: boolean;
}

const MobResetButton: FC<MobResetButtonProps> = (props) => {
  const { act } = useBackend();
  const { no_position, isForeignMob } = props;
  if (!isForeignMob) {
    return null; // return null instead of undefined
  }

  return (
    <Button
      top={no_position ? '' : '30px'}
      right={no_position ? '' : '76px'}
      position={no_position ? '' : 'absolute'}
      color="bad"
      icon="power-off"
      onClick={() => act('reset_mob')}
      tooltip="Reset our focused mob to your active mob"
    />
  );
};

interface ToggleMirrorProps {
  no_position?: boolean;
}

const ToggleMirror: FC<ToggleMirrorProps> = (props) => {
  const { act, data } = useBackend<PlaneDebugData>();
  const { no_position } = props;
  const { tracking_active } = data;

  return (
    <Button
      top={no_position ? '' : '30px'}
      right={no_position ? '' : '52px'}
      position={no_position ? '' : 'absolute'}
      color={tracking_active ? 'bad' : 'good'}
      icon="eye"
      onClick={() => act('toggle_mirroring')}
      tooltip={
        (tracking_active ? 'Disables' : 'Enables') +
        " seeing 'through' the edited mob's eyes, for debugging and such"
      }
    />
  );
};

const has_foreign_mob = (mob_ref, our_ref) => {
  return mob_ref !== our_ref;
};

interface VVButtonProps {
  no_position?: boolean;
}

const VVButton: FC<VVButtonProps> = (props) => {
  const { act } = useBackend();
  const { no_position } = props;

  return (
    <Button
      top={no_position ? '' : '30px'}
      right={no_position ? '' : '28px'}
      position={no_position ? '' : 'absolute'}
      icon="pen"
      onClick={() => act('vv_mob')}
      tooltip="View the variables of our currently focused mob"
    />
  );
};

const GroupDropdown: FC = (props) => {
  const { act, data } = useBackend<PlaneDebugData>();
  const { our_group, present_groups } = data;

  return (
    <Box top={'30px'} left={'28px'} position={'absolute'}>
      <Tooltip
        content="Plane masters are stored in groups, based off where they came from. MAIN is the main group, but if you open something that displays atoms in a new window, it'll show up here"
        position="right"
      >
        <Dropdown
          options={present_groups}
          selected={our_group}
          onSelected={(value) =>
            act('set_group', {
              target_group: value,
            })
          }
        />
      </Tooltip>
    </Box>
  );
};

interface RebuildButtonProps {
  no_position?: boolean;
}

const RebuildButton: FC<RebuildButtonProps> = (props) => {
  const { act } = useBackend();
  const { no_position } = props;

  return (
    <Button
      top={no_position ? '' : '30px'}
      right={no_position ? '' : '6px'}
      position={no_position ? '' : 'absolute'}
      icon="recycle"
      onClick={() => act('rebuild')}
      tooltip="Rebuilds ALL plane masters. Kinda laggy, but useful"
    />
  );
};

interface ClosePlaneWindowProps {
  setReadPlane: Dispatch<SetStateAction<string>>;
}

const ClosePlaneWindow: FC<ClosePlaneWindowProps> = (props) => {
  const { setReadPlane } = props;
  return <Button icon="times" onClick={() => setReadPlane('')} />;
};

interface AddModalProps {
  setShowAdd: Dispatch<SetStateAction<boolean>>;
}
const AddModal: FC<AddModalProps> = (props) => {
  const { act, data } = useBackend<PlaneDebugData>(); // Removed unused setReadPlane
  const { plane_info } = data;
  const { setShowAdd } = props;

  const [currentTarget, setCurrentTarget] = useState<Plane>({} as Plane); // Assuming currentPlane should be passed as prop, if not, it should be obtained from backend data or context
  const [localCurrentPlane, setLocalCurrentPlane] = useState<Plane>(
    {} as Plane,
  ); // Added localCurrentPlane for example
  const currentPlane = localCurrentPlane; // Using localCurrentPlane for now, adjust as needed

  const plane_list = Object.keys(plane_info).map((plane) => plane_info[plane]);
  const planes = sortBy(plane_list, (plane: Plane) => -plane.plane);

  const plane_options = planes.map((plane) => plane.name);

  return (
    <Modal>
      <Section fill title={'Add relay from ' + currentPlane.name} pr="13px">
        <Dropdown
          options={plane_options}
          selected={currentTarget?.name || 'planes'}
          width="300px"
          onSelected={(value) => {
            setCurrentTarget(planes[plane_options.indexOf(value)]);
          }}
        />
        <Stack justify="center" fill pt="10px">
          <Stack.Item>
            <Button
              color="good"
              onClick={() => {
                act('connect_relay', {
                  source: currentPlane.plane,
                  target: currentTarget.plane,
                });
                setShowAdd(false);
              }}
            >
              Confirm
            </Button>
          </Stack.Item>
          <Stack.Item>
            <Button color="bad" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </Stack.Item>
        </Stack>
      </Section>
    </Modal>
  );
};

interface InfoModalProps {
  setShowInfo: Dispatch<SetStateAction<boolean>>;
}

const InfoModal: FC<InfoModalProps> = (props) => {
  const { setShowInfo } = props;
  const pain = '';
  const display = {
    __html: pain,
  };
  return (
    <Modal
      position="absolute"
      top="100px"
      right="180px"
      left="180px"
      bottom="100px"
    >
      <Section
        fill
        scrollable
        title="Information Panel"
        buttons={
          <Button
            icon="times"
            tooltip="Close"
            onClick={() => setShowInfo(false)}
          />
        }
      >
        {planeInfoText}
      </Section>
    </Modal>
  );
};
