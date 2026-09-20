export interface RegionalWeatherData {
  region: string;
  crop: string;
  rainfallMm: number;
  minTempCelsius: number;
  hailDetected: boolean;
  insuranceClaimTriggered: boolean;
  status: 'NORMAL' | 'SINIESTRO_DISPARADO';
  timestamp: string;
}

export const WEATHER_STATIONS: Record<string, RegionalWeatherData> = {
  salta: {
    region: 'Valle de Lerma, Salta',
    crop: 'Tabaco Virginia',
    rainfallMm: 120,
    minTempCelsius: 8,
    hailDetected: false,
    insuranceClaimTriggered: false,
    status: 'NORMAL',
    timestamp: new Date().toISOString(),
  },
  pampa: {
    region: 'Pampa Húmeda, Pergamino',
    crop: 'Soja 1ra',
    rainfallMm: 95,
    minTempCelsius: 5,
    hailDetected: false,
    insuranceClaimTriggered: false,
    status: 'NORMAL',
    timestamp: new Date().toISOString(),
  },
  mendoza: {
    region: 'Valle de Uco, Mendoza',
    crop: 'Vid (Malbec)',
    rainfallMm: 40,
    minTempCelsius: -2,
    hailDetected: true, // Dispara indemnización paramétrica
    insuranceClaimTriggered: true,
    status: 'SINIESTRO_DISPARADO',
    timestamp: new Date().toISOString(),
  },
};

export function getWeatherData(regionKey: string): RegionalWeatherData | undefined {
  return WEATHER_STATIONS[regionKey.toLowerCase()];
}

export function getAllWeatherData(): RegionalWeatherData[] {
  return Object.values(WEATHER_STATIONS);
}
