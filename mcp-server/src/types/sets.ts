// ESO Set Types

export type SetType =
  | 'Overland'
  | 'Dungeon'
  | 'Trial'
  | 'Arena'
  | 'Crafted'
  | 'Monster'
  | 'Mythic'
  | 'PvP'
  | 'Cyrodiil';

export type ArmorWeight = 'Light' | 'Medium' | 'Heavy';

export type BonusType = 'stat' | 'proc' | 'unique';

export interface ESOSet {
  set_id: number;
  name_en: string;
  name_de?: string;
  name_fr?: string;
  name_es?: string;
  set_type: SetType;
  dlc_id: number;
  dlc_name?: string;
  is_veteran: boolean;
  traits_needed?: number;
  is_multi_trial: boolean;
  is_jewelry: boolean;
  description?: string;
  created_at?: string;
}

export interface SetBonus {
  id: number;
  set_id: number;
  pieces_required: number;
  bonus_type?: BonusType;
  stat_type?: string;
  stat_value?: number;
  description?: string;
}

export interface SetLocation {
  id: number;
  set_id: number;
  zone_id?: number;
  zone_name_en?: string;
  zone_name_de?: string;
  zone_name_fr?: string;
  drop_mechanic?: string;
  drop_mechanic_detail?: string;
  wayshrine_node_id?: number;
}

export interface SetEquipmentType {
  set_id: number;
  equip_type: number;
  armor_weight?: ArmorWeight;
  slot_name?: string;
}

export interface Wayshrine {
  wayshrine_node_id: number;
  zone_id?: number;
  zone_name_en?: string;
  zone_name_de?: string;
  wayshrine_name_en?: string;
  wayshrine_name_de?: string;
  map_id?: number;
  alliance?: string;
}

export interface SetSummary {
  set_id: number;
  name: string;
  set_type: SetType;
  dlc_name?: string;
  traits_needed?: number;
  is_veteran: boolean;
  short_description?: string;
}

export interface SetDetails {
  set: ESOSet;
  bonuses: SetBonus[];
  locations: SetLocation[];
  equipment_types: SetEquipmentType[];
  wayshrines?: Wayshrine[];
}

export interface FarmingGuide {
  set: ESOSet;
  locations: SetLocation[];
  wayshrines: Wayshrine[];
  requirements: {
    dlc?: string;
    veteran_mode: boolean;
    group_content: boolean;
    traits_needed?: number;
  };
  drop_mechanics: string[];
  efficiency_tips: string[];
}

export interface DLCInfo {
  dlc_id: number;
  dlc_name: string;
  dlc_type?: string;
  release_date?: string;
  description?: string;
}
