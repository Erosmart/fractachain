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
  status: 'OPEN' | 'SUCCESSFUL' | 'SETTLED' | 'FAILED';
}
