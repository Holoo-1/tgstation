export enum ConnectionType {
  Relay,
  Filter,
}

export enum ConnectionDirection {
  Incoming,
  Outgoing,
}

export type ConnectionRef = {
  ref: string;
  sort_by: number;
};

export type Plane = {
  name: string;
  documentation: string;
  plane: number;
  our_ref: string;
  offset: number;
  real_plane: number;
  renders_onto: number[];
  blend_mode: number;
  color: string | number[];
  alpha: number;
  render_target: string;
  incoming_relays: string[];
  outgoing_relays: string[];
  incoming_filters: string[];
  outgoing_filters: string[];
  intended_hidden: boolean;

  incoming_connections: ConnectionRef[];
  outgoing_connections: ConnectionRef[];

  x: number;
  y: number;
  step_size: number;
  size_x: number;
  size_y: number;
};

export type Relay = {
  name: string;
  layer: number;
};

export type PortProps = {
  connection: Connected;
  isOutput?: boolean;
  onPortMouseDown?: Function;
  act: Function;
};

export type PlaneMasterProps = {
  name: string;
  incoming_connections: ConnectionRef[];
  outgoing_connections: ConnectionRef[];
  connected_list: AssocConnected;
  our_plane: Plane;
  x: number;
  y: number;
  onPortMouseDown: Function;
  act: Function;
};

export type Filter = {
  type: string;
  name: string;
  render_source: string;
};

// export type of something that spawn a connection

export type Connected = {
  connect_color: string;
  source: number;
  source_ref: string;
  target: number;
  target_ref: string;
  our_ref: string;

  source_index: number;
  target_index: number;

  connect_type: ConnectionType;
};

export interface AssocPlane {
  [index: string]: Plane;
}

interface AssocRelays {
  [index: string]: Relay & Connected;
}

interface AssocFilters {
  [index: string]: Filter & Connected;
}

export interface AssocConnected {
  [index: string]: Connected;
}

export interface AssocString {
  [index: string]: string;
}

export type PlaneDebugData = {
  our_group: string;
  present_groups: string[];
  enable_group_view: boolean;
  relay_info: AssocRelays;
  plane_info: AssocPlane;
  filter_connect: AssocFilters;
  depth_stack: AssocString[];
  mob_name: string;
  mob_ref: string;
  our_ref: string;
  tracking_active: boolean;
};
