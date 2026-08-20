export const SECTION1 = [
  {
    keys: ['training facilitated'],
    output: 'Training Facilitated',
    success:
      '100 ICT trainings facilitated are done annually (8 hours training for simple topics with skills test or 16 hours training for complex topics with skills tests).',
  },
  {
    keys: ['layout design', 'lay out design'],
    output: 'Lay out Design',
    success:
      '2200 Requested Layout design in a year (Tarpaulin, Invitation, Label, Promotion & ID Picture & Signature). 0–10 Complex within 5 hours/design; 0–5 Simple 1 hour/design.',
  },
  {
    keys: ['id production', 'id'],
    output: 'ID',
    success:
      '2000 IDs done annually (ID request must be finished at least 2 days upon request or 2 weeks advance for bulk orders with complete details).',
  },
  {
    keys: ['client activities', 'client assistance', 'clients assisted'],
    output: 'Client Assistance',
    success:
      '4000 Clients Assisted for various requests on Typing/Encoding/Printing/e-Appointment (PNP, NBI, PRC, DFA, GSIS, PhilHealth, Pag-IBIG, Landbank, SSS, etc.) one-on-one tutorial and other requests. Done in 10 minutes for very simple, 30 minutes for not so simple, and 5 hours for complex.',
  },
]

export const SECTION2 = [
  {
    keys: ['weekly sales report'],
    output: 'Sales Report',
    success:
      '52 Weekly sales report submitted and money remitted to the treasurer’s office with NO error not later than Thursday of every week.',
  },
  {
    keys: ['monthly sales report'],
    output: 'Monthly Sales Report',
    success: '12 Monthly Sales Report done 5 days after the ensuing month.',
  },
  {
    keys: ['monthly clients report'],
    output: 'Monthly Clients Report',
    success:
      '12 Monthly Clients Summary by Sector and Gender Report done 10 days after the ensuing month.',
  },
  {
    keys: ['monthly training report'],
    output: 'Monthly Training Report',
    success: '12 Monthly Training Report done 15 days after the ensuing month.',
  },
  {
    keys: ['certificates'],
    output: 'Certificates',
    success:
      '100% Training Certificates prepared with no error and ready before the end of each training course.',
  },
  {
    keys: ['annual report'],
    output: 'Annual Report',
    success:
      'Summary of Sales, Clients and Trainings due on the 10th day of January of the following year.',
  },
  {
    keys: ['maintenance'],
    output: 'Maintenance',
    success:
      '120 Performed monthly maintenance of computer, printer, network & other ICT Equipment. Including Installation of application, Assembling PC, Set-up, Checking, troubleshooting, repair & reformat',
  },
  {
    keys: ['project design'],
    output: 'Project Design',
    success:
      '1-5 Project Proposals done in two days for complex and in two hours for regular activities.',
  },
]

export const SECTION3 = [
  {
    keys: ['purchase requests', 'purchase request'],
    output: "PR's/ Vouchers",
    success:
      "0-10 PR'S / Vouchers processed in a year done in 1 day (for common supplies) and 3 days (for uncommon supplies) PLDT processed once bill is received or on the 1st day of duty",
  },
  {
    keys: ['delivery inspection'],
    output: 'Delivery Inspection',
    success:
      '20 Delivery Inspection of ICT Equipment in a year (Desktop computer/Laptop/Printer & other ICT Equipment) at least one hour once asked to proceed to GSO',
  },
  {
    keys: ['computer repair'],
    output: 'Computer (Desktop/Laptop) Repair & Maintenance',
    success:
      '100% of computers (outside client but can be LGU owned) repaired, maintained (reset/cleaned), installed software within the year.',
  },
  {
    keys: ['printer repair'],
    output: 'Printer Repair and Maintenance',
    success:
      '100 % printer reset / repaired annually in average of 2 hrs for simple and 5 days for complex upon availability of parts (in case needed)',
  },
  {
    keys: ['social media'],
    output: 'Social Media',
    success: [
      'Social Media Postings on activities of elearning 5days before the event with no error of relevant information as to date, time and place of activities',
      'Sharing posts of government related information for public consumption at least 4 post in a week.',
      'Social Media Posting on activities done not later than 2 days after the graduation.',
    ],
  },
  {
    keys: ['daily time record', 'dtr'],
    output: 'DTR',
    success:
      "Downloading and preparation of 7 (seven) DTRs without error done in 1 hour ready for employee's signature every 16th or 1st of the month for payroll purposes, and 2 (two) DTRs every 1st day of the month for 2 department heads.",
  },
]

export const SECTION4 = [
  {
    keys: ['payroll'],
    output: 'Payroll',
    success:
      '24 Payroll prepared annually in 1 hour after completion of DTRs and complete with other attachments such as signed accomplishment reports, appointment papers, project design without error and ready for signature of the Center Manager',
  },
  {
    keys: ['monthly schedule'],
    output: 'Monthly Schedule',
    success:
      'Monthly schedule prepared 5 days before the following month duly signed by the supervisor and submitted to HRMO',
  },
  {
    keys: ['daily blotter', 'daily starter'],
    output: 'Daily Blotter',
    success:
      'Daily Blotter printed, signed by all employees present daily, scanned and compiled every month with signature of the supervisor. Scanned copy should be sent to hrmo.@mauban.gov.ph within 3 days of the ensuing month.',
  },
  {
    keys: ['municipal library'],
    output: 'Municipal Library',
    success: [
      '1.1 100% Clients assisted for research of book per year and done 5-10 minutes per client.',
      '1.2 100% Books encoded per year and done 5 minutes per book.',
      '1.3 100% Covered the book per year and done 5 minutes per book.',
      '1.4 12 Monthly Online Report submitted not later than the 3rd day of the ensuing month to the National Library of the Philippines (NLP) portal done within 20-30 minutes per transmittal (https://web.nlp.gov.ph/onlinen-monthly-report-for/).',
    ],
  },
  {
    keys: ['e-learning ville', 'client assist'],
    output: 'E-Learning Ville (Clients Assisting)',
    success:
      "100% Clients Assisted (Seminar, Meeting, Trainees, Printing Documents, Taking Photo and printing for the LGU I.D's and Online Service (Pag-Ibig, NBI, SSS, Police Clearance, Passport and BIR ) venue set-up at least 20 minutes before use (upon availability of chairs)",
  },
]

export const CORE_FUNCTIONS = [...SECTION1, ...SECTION2, ...SECTION3, ...SECTION4]
export const OPCR_SECTIONS = [SECTION1, SECTION2, SECTION3, SECTION4]

export function sectionForOutput(output) {
  const name = String(output || '')
    .trim()
    .toLowerCase()
  if (!name) return 1

  for (let index = 0; index < OPCR_SECTIONS.length; index += 1) {
    const exact = OPCR_SECTIONS[index].some((spec) => spec.keys.some((key) => name === key))
    if (exact) return index + 1
  }

  for (let index = 0; index < OPCR_SECTIONS.length; index += 1) {
    const fuzzy = OPCR_SECTIONS[index].some((spec) =>
      spec.keys.some((key) => key.length > 3 && name.includes(key)),
    )
    if (fuzzy) return index + 1
  }

  return 1
}

export function matchCoreFunction(output) {
  const name = String(output || '')
    .trim()
    .toLowerCase()
  if (!name) return null

  const exact = CORE_FUNCTIONS.find(
    (spec) => spec.output.toLowerCase() === name || spec.keys.some((key) => name === key),
  )
  if (exact) return exact

  if (name.includes(' - ')) return null

  let best = null
  let bestLen = 0
  for (const spec of CORE_FUNCTIONS) {
    for (const key of spec.keys) {
      if (name.includes(key) && key.length > bestLen) {
        best = spec
        bestLen = key.length
      }
    }
  }
  return best
}

export function coreFunctionLabel(output) {
  return matchCoreFunction(output)?.output || String(output || '').trim()
}

export function orderCoreFunctionItems(items) {
  const remaining = [...(items || [])]
  const ordered = []
  for (const spec of CORE_FUNCTIONS) {
    const index = remaining.findIndex(
      (item) => matchCoreFunction(item.output)?.output === spec.output,
    )
    if (index >= 0) ordered.push(remaining.splice(index, 1)[0])
  }
  return ordered.length ? ordered : items || []
}
