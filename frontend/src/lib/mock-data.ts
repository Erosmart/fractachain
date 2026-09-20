export interface Pool {
  id: string;
  title: string;
  producerName: string;
  location: string;
  targetAmount: number;
  raisedAmount: number;
  softCap: number;
  hardCap: number;
  tna: number;
  durationMonths: number;
  daysRemaining: number;
  commodityType: 'Soja' | 'Maíz' | 'Trigo' | 'Vinos';
  riskScore: 'AAA' | 'AA+' | 'A+';
  isSoftCapReached: boolean;
  minInvestment: number;
  status: 'OPEN' | 'SUCCESSFUL' | 'SETTLED';
}

export const MOCK_POOLS: Pool[] = [
  {
    id: 'campana-pergamino-2026',
    title: 'Campaña Soja de Primera & Maíz Tardío',
    producerName: 'Agropecuaria Las Lilas S.A. (CUIT 30-68192014-9)',
    location: 'Pergamino, Buenos Aires',
    targetAmount: 500000,
    raisedAmount: 345000,
    softCap: 200000,
    hardCap: 500000,
    tna: 14.5,
    durationMonths: 12,
    daysRemaining: 14,
    commodityType: 'Soja',
    riskScore: 'AAA',
    isSoftCapReached: true,
    minInvestment: 100,
    status: 'OPEN',
  },
  {
    id: 'riego-valle-de-uco-2026',
    title: 'Infraestructura de Riego Presurizado por Goteo',
    producerName: 'Viñedos Andinos S.A. (CUIT 30-71049281-2)',
    location: 'Valle de Uco, Mendoza',
    targetAmount: 300000,
    raisedAmount: 180000,
    softCap: 150000,
    hardCap: 300000,
    tna: 13.0,
    durationMonths: 18,
    daysRemaining: 21,
    commodityType: 'Vinos',
    riskScore: 'AA+',
    isSoftCapReached: true,
    minInvestment: 250,
    status: 'OPEN',
  },
  {
    id: 'siembra-balcarce-trigo-2026',
    title: 'Financiamiento Insumos Siembra Fina (Trigo / Cebada)',
    producerName: 'Molinos del Sudeste S.A. (CUIT 30-59281726-5)',
    location: 'Balcarce - Tandil, Buenos Aires',
    targetAmount: 250000,
    raisedAmount: 95000,
    softCap: 100000,
    hardCap: 250000,
    tna: 15.2,
    durationMonths: 9,
    daysRemaining: 8,
    commodityType: 'Trigo',
    riskScore: 'A+',
    isSoftCapReached: false,
    minInvestment: 100,
    status: 'OPEN',
  },
];
