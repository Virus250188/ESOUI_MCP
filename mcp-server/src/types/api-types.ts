// ESO API Reference Types

export interface APIFunction {
  id: number;
  name: string;
  namespace?: string | null;
  category?: string | null;
  signature?: string | null;
  parameters?: string | null; // JSON string
  return_values?: string | null; // JSON string
  description?: string | null;
  source_file?: string | null;
  is_protected: boolean;
  api_version?: string | null;
}

export interface APIEvent {
  id: number;
  name: string;
  category?: string | null;
  parameters?: string | null; // JSON string
  description?: string | null;
  source_file?: string | null;
  api_version?: string | null;
}

export interface APIConstant {
  id: number;
  name: string;
  group_name?: string | null;
  value?: string | null;
  value_type?: string | null;
  description?: string | null;
}

export interface UIControl {
  id: number;
  control_type: string;
  methods?: string | null; // JSON string
  properties?: string | null; // JSON string
  events?: string | null; // JSON string
  parent_type?: string | null;
  xml_element?: string | null;
  description?: string | null;
}

export interface ImportMetadata {
  key: string;
  value: string;
  updated_at: string;
}

// Parsed versions (JSON fields resolved)
export interface ParsedAPIFunction {
  name: string;
  namespace?: string;
  category?: string;
  signature?: string;
  parameters: Array<{ name: string; type?: string; description?: string }>;
  return_values: Array<{ type?: string; description?: string }>;
  description?: string;
  source_file?: string;
  is_protected: boolean;
  api_version?: string;
  related_functions?: string[];
}

export interface ParsedAPIEvent {
  name: string;
  category?: string;
  parameters: Array<{ name: string; type?: string; description?: string }>;
  description?: string;
  source_file?: string;
  api_version?: string;
}

export interface ParsedUIControl {
  control_type: string;
  methods: string[];
  properties: string[];
  events: string[];
  parent_type?: string;
  xml_element?: string;
  description?: string;
}
