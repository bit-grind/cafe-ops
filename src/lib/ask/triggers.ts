export function needsBills(q: string): boolean {
  return /\b(bill|bills|invoice|invoices|supplier|suppliers|owing|unpaid|payable|payables|xero|vendor|vendors)\b/i.test(q)
}

export function needsWeather(q: string): boolean {
  return /\b(weather|temperature|temp|hot|cold|warm|rain|sunny|cloudy|forecast|humid|wind)\b/i.test(q)
}
