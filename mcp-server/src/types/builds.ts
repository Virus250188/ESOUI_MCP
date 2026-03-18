// ESO Build Types

export type CharacterClass =
  | 'Dragonknight'
  | 'Sorcerer'
  | 'Nightblade'
  | 'Templar'
  | 'Warden'
  | 'Necromancer'
  | 'Arcanist';

export type CharacterRole = 'DPS' | 'Tank' | 'Healer' | 'PvP';

export type ResourceType = 'Magicka' | 'Stamina' | 'Health' | 'Hybrid';

export interface BuildTemplate {
  id: number;
  class: CharacterClass;
  role: CharacterRole;
  resource: ResourceType;
  set_1_id?: number;
  set_2_id?: number;
  monster_set_id?: number;
  mythic_id?: number;
  priority: number;
  patch_version?: string;
  notes?: string;
}

export interface CharacterContext {
  context_id: string;
  class: CharacterClass;
  level: number;
  role?: CharacterRole;
  build_goal?: string;
  dlc_owned?: string[];
  crafting_traits?: {
    blacksmithing?: number;
    clothier?: number;
    woodworking?: number;
  };
  current_sets?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface BuildRecommendation {
  build_name: string;
  confidence: number;
  class: CharacterClass;
  role: CharacterRole;
  resource: ResourceType;
  sets: BuildSetSlot[];
  progression_path?: string[];
  notes?: string;
}

export interface BuildSetSlot {
  slot: string;
  set_id: number;
  set_name: string;
  reason: string;
  farming_difficulty: 'Easy' | 'Medium' | 'Hard' | 'Very Hard';
  alternative_sets?: Array<{
    set_id: number;
    set_name: string;
  }>;
}

export interface SetComparison {
  sets: Array<{
    set_id: number;
    name: string;
    set_type: string;
    dlc_name?: string;
    bonuses: Array<{
      pieces: number;
      description: string;
    }>;
    farming_difficulty: string;
    accessibility: {
      base_game: boolean;
      solo_farmable: boolean;
      requires_veteran: boolean;
      traits_needed?: number;
    };
  }>;
  analysis?: {
    best_for_role?: string;
    synergies?: string[];
    trade_offs?: string[];
  };
}
