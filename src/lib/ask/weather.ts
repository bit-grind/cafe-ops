export type BrisbaneWeather = {
  date: string
  max_temp_c: number | null
  min_temp_c: number | null
  precipitation_mm: number | null
  conditions: string
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Heavy drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  80: 'Slight showers', 81: 'Moderate showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm with hail',
}

export async function fetchBrisbaneWeather(date: string): Promise<BrisbaneWeather | null> {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=-27.47&longitude=153.02&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Australia%2FBrisbane`
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return null
    const data = await resp.json()
    const daily = data.daily
    if (!daily) return null
    const code = daily.weathercode?.[0]
    return {
      date,
      max_temp_c: daily.temperature_2m_max?.[0] ?? null,
      min_temp_c: daily.temperature_2m_min?.[0] ?? null,
      precipitation_mm: daily.precipitation_sum?.[0] ?? null,
      conditions: code != null ? (WMO_CODES[code] ?? `Code ${code}`) : 'Unknown',
    }
  } catch {
    return null
  }
}
