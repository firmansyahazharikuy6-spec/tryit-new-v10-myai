import { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
} from 'lucide-react';
import type { GroundingSource } from '../../types/workspace';

interface CityPreset {
  id: string;
  label: string;
  lat: number;
  lng: number;
  note: string;
}

const CITY_PRESETS: CityPreset[] = [
  {
    id: 'jakarta',
    label: 'Jakarta',
    lat: -6.2088,
    lng: 106.8456,
    note: 'Sudirman Central Business District & Tech Hub',
  },
  {
    id: 'singapore',
    label: 'Singapore',
    lat: 1.2834,
    lng: 103.8607,
    note: 'Marina Bay Innovation Corridor',
  },
  {
    id: 'tokyo',
    label: 'Tokyo',
    lat: 35.6595,
    lng: 139.7004,
    note: 'Shibuya AI & Robotics District',
  },
  {
    id: 'sf',
    label: 'San Francisco',
    lat: 37.7749,
    lng: -122.4194,
    note: 'Bay Area Frontier Lab Corridor',
  },
  {
    id: 'london',
    label: 'London',
    lat: 51.5313,
    lng: -0.126,
    note: 'King’s Cross Knowledge Quarter',
  },
];

function InteractiveHubMarker({
  hub,
  selected,
  onSelect,
}: {
  hub: CityPreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: hub.lat, lng: hub.lng }}
        onClick={onSelect}
        title={hub.label}
      >
        <Pin
          background={selected ? '#4f46e5' : '#0f172a'}
          borderColor={selected ? '#818cf8' : '#38bdf8'}
          glyphColor="#ffffff"
          scale={selected ? 1.25 : 1.0}
        />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={240} onCloseClick={() => {}}>
          <div className="p-1 text-zinc-900">
            <div className="font-semibold text-xs">{hub.label}</div>
            <div className="text-[11px] text-zinc-600 mt-0.5">{hub.note}</div>
            <div className="text-[10px] font-mono text-zinc-500 mt-1">
              {hub.lat.toFixed(4)}, {hub.lng.toFixed(4)}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function MapsExplorer() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  );
  const [keyLoading, setKeyLoading] = useState(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: CITY_PRESETS[0].lat,
    lng: CITY_PRESETS[0].lng,
  });
  const [selectedHubId, setSelectedHubId] = useState<string>(CITY_PRESETS[0].id);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Google Maps Grounding via Gemini API
  const [queryText, setQueryText] = useState(
    'Find top-rated coworking spaces and specialty coffee shops near my selected location.',
  );
  const [searching, setSearching] = useState(false);
  const [groundingAnswer, setGroundingAnswer] = useState<string>('');
  const [places, setPlaces] = useState<GroundingSource[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (mapsApiKey) {
      setKeyLoading(false);
      return;
    }
    let cancelled = false;
    void fetch('/api/maps/config')
      .then((res) => res.json())
      .then((data: { apiKey?: string }) => {
        if (!cancelled && data.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {
        // Handled cleanly via missing-key state
      })
      .finally(() => {
        if (!cancelled) setKeyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsApiKey]);

  function handleSelectPreset(hub: CityPreset) {
    setSelectedHubId(hub.id);
    setCenter({ lat: hub.lat, lng: hub.lng });
    setGeoStatus(null);
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation is not supported in this browser.');
      return;
    }
    setGeoStatus('Requesting device coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setSelectedHubId('');
        setGeoStatus(
          `Centered on device (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
        );
      },
      (err) => {
        setGeoStatus(`Location access denied or unavailable (${err.message}).`);
      },
      { timeout: 8000 },
    );
  }

  async function handleMapsExploreSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = queryText.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setSearchError(null);

    try {
      const res = await fetch('/api/ai/maps-explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          latitude: center.lat,
          longitude: center.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (
          res.status === 429 ||
          String(data.error || '').includes('RESOURCE_EXHAUSTED')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSearchError(data.error || 'Google Maps Grounding query failed.');
        return;
      }
      setGroundingAnswer(data.text || '');
      setPlaces(Array.isArray(data.places) ? data.places : []);
    } catch {
      setSearchError('Network error while contacting /api/ai/maps-explore.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      {/* Left: Interactive @vis.gl/react-google-maps Map */}
      <div className="lg:col-span-7 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {CITY_PRESETS.map((hub) => (
              <button
                key={hub.id}
                type="button"
                onClick={() => handleSelectPreset(hub)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  selectedHubId === hub.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                }`}
              >
                {hub.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleUseMyLocation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5 text-indigo-500" />
            <span>My Location</span>
          </button>
        </div>

        {geoStatus && (
          <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400">{geoStatus}</p>
        )}

        <div className="h-[380px] sm:h-[440px] w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950">
          {keyLoading ? (
            <div className="h-full flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading Google Maps configuration...</span>
            </div>
          ) : !mapsApiKey ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
              <MapPin className="w-7 h-7 text-indigo-400" />
              <div className="text-sm font-medium text-zinc-100">
                Google Maps JS API Key Pending
              </div>
              <p className="text-xs text-zinc-400 max-w-sm">
                Ensure <code className="font-mono">GOOGLE_MAPS_API_KEY</code> is available in runtime
                environment secrets to mount the interactive map canvas.
              </p>
            </div>
          ) : (
            <APIProvider apiKey={mapsApiKey} libraries={['marker']} language="en">
              <GoogleMap
                mapId="DEMO_MAP_ID"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                center={center}
                defaultZoom={12}
                gestureHandling="greedy"
                disableDefaultUI={false}
                className="w-full h-full"
                onCenterChanged={(ev) => {
                  const next = ev.detail.center;
                  if (next) setCenter({ lat: next.lat, lng: next.lng });
                }}
              >
                {CITY_PRESETS.map((hub) => (
                  <InteractiveHubMarker
                    key={hub.id}
                    hub={hub}
                    selected={selectedHubId === hub.id}
                    onSelect={() => handleSelectPreset(hub)}
                  />
                ))}
              </GoogleMap>
            </APIProvider>
          )}
        </div>
      </div>

      {/* Right: Gemini Google Maps Grounding Panel */}
      <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-indigo-500" />
          <h3 className="font-display text-sm font-semibold">
            Google Maps Grounding (Gemini 4 Hydrogen)
          </h3>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Query real places, ratings, and review snippets anchored at{' '}
          <span className="font-mono">
            {center.lat.toFixed(3)}, {center.lng.toFixed(3)}
          </span>
          .
        </p>

        <form onSubmit={handleMapsExploreSubmit} className="space-y-3">
          <textarea
            rows={3}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search real places, transit, restaurants, or coworking nearby..."
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          />
          <button
            type="submit"
            disabled={searching || !queryText.trim()}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {searching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Searching Google Maps...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Search Grounded Places</span>
              </>
            )}
          </button>
        </form>

        {searchError && (
          <div className="p-3 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{searchError}</span>
          </div>
        )}

        {groundingAnswer && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3 max-h-[280px] overflow-y-auto">
            <div className="text-xs leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
              {groundingAnswer}
            </div>

            {places.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Verified Google Maps Places
                </div>
                {places.map((pl) => (
                  <div
                    key={pl.url}
                    className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 space-y-1"
                  >
                    <a
                      href={pl.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <span>{pl.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    {pl.reviewSnippets && pl.reviewSnippets.length > 0 && (
                      <ul className="space-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {pl.reviewSnippets.map((snip, idx) => (
                          <li key={idx}>“{snip}”</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
