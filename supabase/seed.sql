-- Seed the current OPCR period and office targets from the OPCR form.
-- Run after schema.sql.

insert into public.opcr_periods (id, year, title, start_date, end_date, status, office_name)
values (
  '11111111-1111-1111-1111-111111111111',
  2026,
  'Office Performance Commitment and Review',
  '2026-01-01',
  '2026-12-31',
  'active',
  'E-Learning Ville, LGU Mauban, Quezon'
)
on conflict (id) do update
set
  year = excluded.year,
  title = excluded.title,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  office_name = excluded.office_name;

insert into public.opcr_items (period_id, category, output, success_indicator, sort_order)
select
  period_id::uuid,
  category,
  output,
  success_indicator,
  sort_order
from (values
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Training Facilitated',
    '200 ICT trainings facilitated annually (2–15 hours depending on complexity; skills test for complex topics).',
    10
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Lay out Design',
    '1,000 layout projects per year (tarpaulins, invitations, labels, and related materials) completed within the prescribed turnaround for simple and complex requests.',
    20
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'ID',
    '2,000 IDs (new/renewal) annually; individual requests finished within 1 day and bulk requests within 1 week.',
    30
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Client Assistance',
    '4,000 clients assisted in typing, encoding, printing, and online government services (NBI, PRC, GSIS, passport, and related transactions).',
    40
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Sales Report',
    '52 weekly sales reports prepared, with collections remitted every Thursday.',
    50
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Monthly Sales Report',
    '12 monthly sales reports submitted within 5 days after the end of each month.',
    60
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Monthly Clients Report',
    '12 client summary reports by sector and gender, submitted within 10 days after the end of each month.',
    70
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Monthly Training Report',
    '12 monthly training reports submitted within 15 days after the end of each month.',
    80
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Certificates',
    '100% of training certificates prepared error-free before the end of each course (target 2,000 certificates).',
    90
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Annual Report',
    'Annual summary of sales, clients, and trainings submitted on or before January 10 of the following year.',
    100
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Maintenance',
    'Monthly performance maintenance of computers, printers, and network equipment, including setup, reformatting, and troubleshooting.',
    110
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Project Design',
    '1–5 project proposals completed within 5 days for complex work or 3 days for regular work.',
    120
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'PR''s/ Vouchers',
    '8–10 purchase requests / purchase orders prepared annually within 1 day (common items) or 3 days (uncommon items).',
    130
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Delivery Inspection',
    'ICT equipment inspected within one hour of delivery/arrival.',
    140
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Computer (Desktop/Laptop) Repair & Maintenance',
    '100% of available desktop/laptop units repaired or maintained within the year.',
    150
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Printer Repair and Maintenance',
    '100% of printer repair and service completed, including complex work within 3–10 days.',
    160
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Social Media',
    'Event postings 4–5 days before activities; at least 3–5 relevant government/office posts per week; activity recaps posted within 24 hours.',
    170
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'DTR',
    '12 monthly DTR monitoring and preparation reports for personnel completed after each month.',
    180
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Payroll',
    '24 payrolls prepared annually, completed within 1 hour after DTR finalization.',
    190
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Monthly Schedule',
    'Monthly work schedule prepared 5 days before the ensuing month.',
    200
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Daily Blotter',
    'Daily starter photos/articles shared for personnel; visitor log summarized and remitted monthly, with digital copies sent within 3 days of month-end.',
    210
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'Municipal Library',
    'Client assistance (5–10 minutes), book encoding/sorting/covering, and monthly online reports submitted to the National Library.',
    220
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'Core Functions',
    'E-Learning Ville (Clients Assisting)',
    '100% assistance for clients using seminars, meetings, internet, and LGU online services, with setup completed 30 minutes before use.',
    230
  )
) as seed_items(period_id, category, output, success_indicator, sort_order)
where not exists (
  select 1
  from public.opcr_items
  where period_id = '11111111-1111-1111-1111-111111111111'
);

-- Align existing item names with the OPCR form labels.
update public.opcr_items set output = 'Lay out Design' where output = 'Layout Design';
update public.opcr_items set output = 'ID' where output = 'ID Production';
update public.opcr_items set output = 'Client Assistance' where output = 'Client Activities';
update public.opcr_items set output = 'Sales Report' where output = 'Weekly Sales Report';
update public.opcr_items set output = 'PR''s/ Vouchers' where output = 'Purchase Requests';
update public.opcr_items set output = 'Computer (Desktop/Laptop) Repair & Maintenance' where output = 'Computer Repair and Maintenance';
update public.opcr_items set output = 'DTR' where output = 'Daily Time Record (DTR)';
update public.opcr_items set output = 'Daily Blotter' where output = 'Daily Starter';
update public.opcr_items set output = 'E-Learning Ville (Clients Assisting)' where output = 'E-Learning Ville (Client Assist)';
