export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

const REGIONS: Record<CountryCode, string[]> = {
  US: ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
  CA: ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'],
  MX: ['AG','BC','BS','CM','CS','CH','CO','CL','DG','GJ','GR','HG','JA','MX','MC','MR','NA','NL','OA','PU','QE','QR','SL','SI','SO','TB','TM','TL','VE','YU','ZA'],
};

export const regionsFor = (country: CountryCode): string[] => REGIONS[country] ?? [];
