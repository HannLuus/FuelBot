import L from 'leaflet'

export const YANGON_LAT = 16.8661
export const YANGON_LNG = 96.1561

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export type SharedMapStyle = 'light' | 'dark'

export function makeCartoTileLayer(style: SharedMapStyle = 'light'): L.TileLayer {
  const url =
    style === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'

  return L.tileLayer(url, {
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: CARTO_ATTRIBUTION,
  })
}

export function makeOsmFallbackTileLayer(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 20,
    attribution: OSM_ATTRIBUTION,
  })
}
