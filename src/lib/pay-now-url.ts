/**
 * Pay Now URL Generator
 * 
 * Generates a pre-filled DPP payment form URL for invoice emails.
 * Uses the DPP Online Forms (iATS) universal payment form with query
 * param pre-fill. The form is merchant-wide; each invoice gets a
 * unique URL via pre-populated amount, invoice number, and customer info.
 * 
 * Form: https://of.deluxe.com/gateway/publish/c7dc2aff-3ef0-9b96-f10a-0d2c7cc654ec
 * 
 * DPP Pre-fill Field Reference:
 *   paymentInvoice                          — Invoice number
 *   IATS_PaymentItemInput_TotalAmount       — Amount
 *   IATS_PaymentItemInput_First_Name_1      — First Name
 *   IATS_PaymentItemInput_Last_Name_1       — Last Name
 *   IATS_PaymentItemInput_Company_Name_1    — Company Name
 *   IATS_PaymentItemInput_Email_1           — Email
 *   IATS_PaymentItemInput_Phone_1           — Phone
 *   IATS_PaymentItemInput_Address_1         — Address
 *   IATS_PaymentItemInput_City_1            — City
 *   IATS_PaymentItemInput_State_1           — State
 *   IATS_PaymentItemInput_Zip_1             — Zip
 *   IATS_PaymentItemInput_Country_1         — Country
 *   customerRefNo                           — Customer Reference Number
 */

const DPP_FORM_URL = 'https://of.deluxe.com/gateway/publish/c7dc2aff-3ef0-9b96-f10a-0d2c7cc654ec';

interface PayNowParams {
  merchantId: string;       // DPP merchant ID (used as customerRefNo)
  invoiceNumber: string;    // QB invoice number
  amount: number;           // Amount due
  customerEmail?: string;
  customerName?: string;    // Full name — will be split into first/last
  customerPhone?: string;
  billingAddress?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

/**
 * Generate a pre-filled DPP payment form URL.
 * 
 * The invoice number and amount are always included.
 * Customer info is added when available (pulled from QB invoice).
 * The customer sees the form with fields already filled — they just
 * enter card details and submit.
 */
export function generatePayNowUrl(params: PayNowParams): string {
  const {
    merchantId, invoiceNumber, amount,
    customerEmail, customerName, customerPhone,
    billingAddress,
  } = params;

  // Split customer name into first/last (best effort)
  const { firstName, lastName } = splitName(customerName);

  // Build query params — only include non-empty values
  const fields: Record<string, string> = {};

  // Required: invoice + amount
  fields['paymentInvoice'] = invoiceNumber;
  fields['IATS_PaymentItemInput_TotalAmount'] = amount.toFixed(2);

  // Customer info (when available from QB)
  if (firstName) fields['IATS_PaymentItemInput_First_Name_1'] = firstName;
  if (lastName) fields['IATS_PaymentItemInput_Last_Name_1'] = lastName;
  if (customerEmail) fields['IATS_PaymentItemInput_Email_1'] = customerEmail;
  if (customerPhone) fields['IATS_PaymentItemInput_Phone_1'] = customerPhone;

  // Billing address
  if (billingAddress?.address) fields['IATS_PaymentItemInput_Address_1'] = billingAddress.address;
  if (billingAddress?.city) fields['IATS_PaymentItemInput_City_1'] = billingAddress.city;
  if (billingAddress?.state) fields['IATS_PaymentItemInput_State_1'] = billingAddress.state;
  if (billingAddress?.zip) fields['IATS_PaymentItemInput_Zip_1'] = billingAddress.zip;
  if (billingAddress?.country) fields['IATS_PaymentItemInput_Country_1'] = billingAddress.country;

  // Reference number for matching on DPP side
  if (merchantId) fields['customerRefNo'] = merchantId;

  const qs = new URLSearchParams(fields);
  return `${DPP_FORM_URL}?${qs.toString()}`;
}

/**
 * Split a full name into first and last.
 * "John Smith" → { firstName: "John", lastName: "Smith" }
 * "John Michael Smith" → { firstName: "John", lastName: "Michael Smith" }
 * "John" → { firstName: "John", lastName: "" }
 */
function splitName(fullName?: string): { firstName: string; lastName: string } {
  if (!fullName?.trim()) return { firstName: '', lastName: '' };

  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  return { firstName, lastName };
}