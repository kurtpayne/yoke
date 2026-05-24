import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapPin } from "lucide-react";
import { Panel } from "./Panel";
import type { AnalysisResult } from "../utils/types";

export function IpMap({ data }: { data: AnalysisResult }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const lat = data.ip_info?.lat;
  const lon = data.ip_info?.lon;

  useEffect(() => {
    if (!mapRef.current || lat == null || lon == null) return;

    // Destroy previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [lat, lon],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Add circle marker
    L.circleMarker([lat, lon], {
      radius: 8,
      fillColor: "#58a6ff",
      color: "#58a6ff",
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.3,
    }).addTo(map).bindPopup(
      `<div style="font-family:monospace;font-size:12px;color:#333">
        <strong>${data.ip_info?.ip ?? ""}</strong><br/>
        ${data.ip_info?.city ?? ""}, ${data.ip_info?.country ?? ""}<br/>
        ${data.ip_info?.isp ?? ""}
      </div>`
    );

    // Add a pulsing ring
    L.circleMarker([lat, lon], {
      radius: 16,
      fillColor: "#58a6ff",
      color: "#58a6ff",
      weight: 1,
      opacity: 0.3,
      fillOpacity: 0.05,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Force a resize after render
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [lat, lon, data.ip_info?.ip, data.ip_info?.city, data.ip_info?.country, data.ip_info?.isp]);

  if (lat == null || lon == null) return null;

  return (
    <Panel title="IP Geolocation Map" icon={<MapPin size={14} />}>
      <div className="p-3">
        <div
          ref={mapRef}
          style={{ height: "320px", borderRadius: "var(--radius-sm)", overflow: "hidden" }}
        />
        <div className="flex items-center gap-3 mt-2 px-1">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>
            {lat.toFixed(4)}, {lon.toFixed(4)}
          </span>
          {data.ip_info?.city && (
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--text-secondary)" }}>
              {data.ip_info.city}, {data.ip_info.country}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}
