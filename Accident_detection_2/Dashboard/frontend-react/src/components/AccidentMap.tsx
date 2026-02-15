import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Accident } from '../types';

interface AccidentMapProps {
  accidents: Accident[];
  onAccidentSelect: (accident: Accident) => void;
}

export const AccidentMap: React.FC<AccidentMapProps> = ({
  accidents,
  onAccidentSelect,
}) => {
  const parseGPS = (gps: string) => {
    const [lat, lng] = gps.split(',').map(Number);
    return { lat: lat || 19.0760, lng: lng || 72.8777 };
  };

  return (
    <MapContainer
      center={[19.0760, 72.8777]} // Mumbai
      zoom={12}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {accidents.map(accident => {
        const pos = parseGPS(accident.gps);
        return (
          <Marker
            key={accident._id}
            position={[pos.lat, pos.lng]}
            eventHandlers={{
              click: () => onAccidentSelect(accident),
            }}
          >
            <Popup>
              <div>
                <p><strong>Severity:</strong> {accident.severity}</p>
                <p><strong>Time:</strong> {new Date(accident.timestamp).toLocaleString()}</p>
                <p><strong>Device:</strong> {accident.deviceId}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};
