import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { format } from 'date-fns';
import { AlertTriangle, MapPin, Clock, Zap } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface Accident {
  _id: string;
  imageBase64: string;
  timestamp: string;
  gps: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'dispatched' | 'resolved';
  verified: boolean;
  mlConfidence?: number;
  deviceId: string;
}

interface Stats {
  total: number;
  critical: number;
  high: number;
  pending: number;
  todayCount: number;
}

const App: React.FC = () => {
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [selectedAccident, setSelectedAccident] = useState<Accident | null>(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('new-accident', (accident: Accident) => {
      setAccidents(prev => [accident, ...prev]);
      // Play alert sound for high/critical
      if (accident.severity === 'high' || accident.severity === 'critical') {
        playAlertSound();
      }
    });

    newSocket.on('accident-update', (updated: Accident) => {
      setAccidents(prev =>
        prev.map(acc => acc._id === updated._id ? updated : acc)
      );
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Load initial data
  useEffect(() => {
    loadAccidents();
    loadStats();
  }, []);

  const loadAccidents = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/accidents?limit=50');
      const data = await response.json();
      setAccidents(data);
    } catch (error) {
      console.error('Failed to load accidents:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/accidents/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const playAlertSound = () => {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'alert-high';
      case 'high': return 'alert-medium';
      case 'medium': return 'alert-low';
      default: return 'gray-500';
    }
  };

  const filteredAccidents = accidents.filter(acc => {
    if (filter === 'all') return true;
    return acc.severity === filter || acc.status === filter;
  });

  const parseGPS = (gps: string) => {
    const [lat, lng] = gps.split(',').map(Number);
    return { lat: lat || 19.0760, lng: lng || 72.8777 }; // Mumbai default
  };

  return (
    <div className="min-h-screen bg-police-dark">
      {/* Header */}
      <header className="bg-police-gray border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-8 w-8 text-police-red" />
            <h1 className="text-2xl font-bold text-white">TRAFCCON360</h1>
            <span className="text-sm text-gray-400">Police Dashboard</span>
          </div>
          <div className="flex items-center space-x-4">
            {stats && (
              <div className="flex space-x-4 text-sm">
                <span className="text-red-400">🚨 {stats.critical} Critical</span>
                <span className="text-yellow-400">⚠️ {stats.high} High</span>
                <span className="text-blue-400">📊 {stats.total} Total</span>
                <span className="text-green-400">📅 {stats.todayCount} Today</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex h-screen">
        {/* Sidebar - Accident List */}
        <div className="w-1/3 bg-gray-800 border-r border-gray-700 overflow-y-auto">
          <div className="p-4 border-b border-gray-700">
            <div className="flex space-x-2 mb-4">
              {['all', 'critical', 'high', 'medium', 'pending'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-sm ${
                    filter === f
                      ? 'bg-police-red text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 p-4">
            {filteredAccidents.map(accident => (
              <div
                key={accident._id}
                onClick={() => setSelectedAccident(accident)}
                className={`p-3 rounded-lg cursor-pointer border transition-colors ${
                  selectedAccident?._id === accident._id
                    ? 'border-police-red bg-gray-700'
                    : 'border-gray-600 bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium bg-${getSeverityColor(accident.severity)} text-white`}>
                    {accident.severity.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(accident.timestamp), 'HH:mm')}
                  </span>
                </div>
                <div className="flex items-center text-sm text-gray-300 mb-1">
                  <MapPin className="h-4 w-4 mr-1" />
                  {accident.gps}
                </div>
                <div className="flex items-center text-sm text-gray-300">
                  <Clock className="h-4 w-4 mr-1" />
                  {accident.deviceId}
                  {accident.verified && <Zap className="h-4 w-4 ml-2 text-green-400" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Map */}
          <div className="h-1/2">
            <MapContainer
              center={[19.0760, 72.8777]} // Mumbai
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {filteredAccidents.map(accident => {
                const pos = parseGPS(accident.gps);
                return (
                  <Marker
                    key={accident._id}
                    position={[pos.lat, pos.lng]}
                    eventHandlers={{
                      click: () => setSelectedAccident(accident),
                    }}
                  >
                    <Popup>
                      <div className="text-black">
                        <p><strong>Severity:</strong> {accident.severity}</p>
                        <p><strong>Time:</strong> {format(new Date(accident.timestamp), 'PPpp')}</p>
                        <p><strong>Device:</strong> {accident.deviceId}</p>
                        {accident.mlConfidence && (
                          <p><strong>ML Confidence:</strong> {(accident.mlConfidence * 100).toFixed(1)}%</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* Accident Details */}
          <div className="h-1/2 bg-gray-900 p-4 overflow-y-auto">
            {selectedAccident ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">
                    Accident Details
                  </h2>
                  <span className={`px-3 py-1 rounded text-sm font-medium bg-${getSeverityColor(selectedAccident.severity)} text-white`}>
                    {selectedAccident.severity.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <img
                      src={`data:image/jpeg;base64,${selectedAccident.imageBase64}`}
                      alt="Accident"
                      className="w-full h-48 object-cover rounded-lg border border-gray-600"
                    />
                  </div>
                  <div className="space-y-2 text-sm">
                    <div><strong>Time:</strong> {format(new Date(selectedAccident.timestamp), 'PPpp')}</div>
                    <div><strong>Location:</strong> {selectedAccident.gps}</div>
                    <div><strong>Device:</strong> {selectedAccident.deviceId}</div>
                    <div><strong>Status:</strong> {selectedAccident.status}</div>
                    {selectedAccident.mlConfidence && (
                      <div><strong>ML Confidence:</strong> {(selectedAccident.mlConfidence * 100).toFixed(1)}%</div>
                    )}
                    <div><strong>Verified:</strong> {selectedAccident.verified ? '✅ Yes' : '❌ No'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>Select an accident to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
