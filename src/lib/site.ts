/** Company details shown on the home page, contact page and footer. */
export const CONTACT = {
  phone: '(480)-581-7145',
  phoneHref: 'tel:+14805817145',
  hours: [
    { days: 'Mon - Thu', time: '7:30a - 4:30p' },
    { days: 'Friday', time: '7:30a - 11:30a' },
  ],
  email: 'info@forcedowels.com',
  street: '4455 E Nunneley Rd, Ste 103',
  cityStateZip: 'Gilbert, AZ 85296',
  response: 'Will respond to customer requests within 1 business day',
} as const;

export const CONTACT_ADDRESS = `${CONTACT.street}, ${CONTACT.cityStateZip}`;
