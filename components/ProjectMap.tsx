
import React, { useEffect, useRef, useState } from 'react';
import { ProjectEstimate } from '../types';
import { MapPin, AlertCircle } from 'lucide-react';

interface ProjectMapProps {
  projects: ProjectEstimate[];
  center?: { lat: number, lng: number };
  zoom?: number;
}

// Exported helper for consistent geocoding simulation across the app
export const getPseudoCoordinates = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Center around Miami (25.7617, -80.1918)
    // Spread by roughly +/- 0.1 degrees (~7 miles)
    const latOffset = (hash % 1000) / 10000; 
    const lngOffset = ((hash >> 5) % 1000) / 10000;
    
    return {
      lat: 25.7617 + latOffset,
      lng: -80.1918 + lngOffset
    };
};

export const ProjectMap: React.FC<ProjectMapProps> = ({ projects, center, zoom = 11 }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [libLoaded, setLibLoaded] = useState(false);

  // Filter only Draft/Ongoing projects for the main map
  const visibleProjects = projects.filter(p => p.status === 'Draft' || p.status === 'Ongoing' || p.status === 'Sent');

  useEffect(() => {
    // Check if Leaflet is loaded
    if (typeof window !== 'undefined' && (window as any).L) {
        setLibLoaded(true);
    } else {
        // Poll for it briefly if script is still loading
        const interval = setInterval(() => {
             if ((window as any).L) {
                 setLibLoaded(true);
                 clearInterval(interval);
             }
        }, 100);
        return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (!libLoaded || !mapRef.current) return;

    const L = (window as any).L;

    const initialCenter = center ? [center.lat, center.lng] : [25.7617, -80.1918];

    // Initialize Map if not already done
    if (!mapInstanceRef.current) {
        mapInstanceRef.current = L.map(mapRef.current).setView(initialCenter, zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstanceRef.current);
    } else {
        // Update view if center prop changes
        mapInstanceRef.current.setView(initialCenter, zoom);
    }

    const map = mapInstanceRef.current;

    // Clear existing markers
    map.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Custom Icons
    const draftIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: #3b82f6; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    const ongoingIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    // Add Markers
    visibleProjects.forEach(project => {
        const coords = getPseudoCoordinates(project.address + project.id);
        const isOngoing = project.status === 'Ongoing';
        
        const marker = L.marker([coords.lat, coords.lng], { icon: isOngoing ? ongoingIcon : draftIcon }).addTo(map);
        
        const popupContent = `
            <div style="font-family: 'Inter', sans-serif; min-width: 200px;">
                <h3 style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">${project.name}</h3>
                <p style="font-size: 12px; color: #64748b; margin: 0;">${project.address}</p>
                <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                     <span style="background: ${isOngoing ? '#d1fae5' : '#eff6ff'}; color: ${isOngoing ? '#047857' : '#2563eb'}; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase;">${project.status}</span>
                     <span style="font-weight: 600; color: #0f172a;">$${(project.contractValue || 0).toLocaleString()}</span>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
    });

  }, [visibleProjects, libLoaded, center, zoom]);

  if (!libLoaded) {
      return (
          <div className="w-full h-full min-h-[300px] bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
              <span className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Loading Map...
              </span>
          </div>
      );
  }

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-xl overflow-hidden shadow-sm border border-slate-200 z-0">
        <div id="map" ref={mapRef} className="w-full h-full z-0"></div>
        
        {/* Legend Overlay */}
        <div className="absolute top-4 right-4 bg-white p-3 rounded-lg shadow-lg z-[400] border border-slate-100 max-w-xs">
            <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-2">
                <MapPin className="w-3 h-3 text-slate-500" /> Legend
            </h4>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500 border border-white shadow-sm"></div>
                    <span className="text-[10px] text-slate-600">Draft / Sent</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white shadow-sm"></div>
                    <span className="text-[10px] text-slate-600">Ongoing</span>
                </div>
            </div>
        </div>
    </div>
  );
};
