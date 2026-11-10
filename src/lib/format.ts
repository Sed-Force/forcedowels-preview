const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const formatMoney = (amount: number) => usd.format(Number(amount) || 0);

/** Per-unit prices carry four decimals ($0.0720). */
export const formatUnitPrice = (amount: number) => `$${(Number(amount) || 0).toFixed(4)}`;

export const formatNumber = (n: number) => (Number(n) || 0).toLocaleString('en-US');
