export interface Accident {
  _id: string;
  imageBase64: string;
  timestamp: string;
  gps: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'dispatched' | 'resolved';
  verified: boolean;
  mlConfidence?: number;
  deviceId: string;
  address?: string;
}

export interface Stats {
  total: number;
  critical: number;
  high: number;
  pending: number;
  todayCount: number;
}

export interface SignalState {
  lane1: string;
  lane2: string;
  lane3: string;
  lane4: string;
}

export interface EmergencyState {
  is_active: boolean;
  lane_id: number | null;
}
