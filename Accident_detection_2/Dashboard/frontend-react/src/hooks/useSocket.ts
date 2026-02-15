import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  return { socket, isConnected };
};

export const useAccidents = () => {
  const [accidents, setAccidents] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Load initial data
    fetchAccidents();
    fetchStats();
  }, []);

  const fetchAccidents = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/accidents?limit=50');
      const data = await response.json();
      setAccidents(data);
    } catch (error) {
      console.error('Failed to fetch accidents:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/accidents/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  return { accidents, stats, refetch: fetchAccidents };
};
