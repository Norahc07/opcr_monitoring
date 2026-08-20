-- Extra OPCR items that match the tally-per-person sheet.
-- Safe to re-run; skips outputs that already exist.

insert into public.opcr_items (period_id, category, output, success_indicator, sort_order)
select
  '11111111-1111-1111-1111-111111111111',
  extra.category,
  extra.output,
  extra.success_indicator,
  extra.sort_order
from (
  values
    ('Social Media', 'Social Media - Activities', 'Event and activity posts published before and after office activities.', 171),
    ('Social Media', 'Social Media - Post Sharing', 'Sharing of relevant LGU / government posts during the period.', 172),
    ('Social Media', 'Social Media - Graduation Posts', 'Graduation and completion posts published after trainings.', 173),
    ('Admin Support', 'Daily Blotter', 'Daily blotter / visitor log prepared and summarized for the period.', 211),
    ('Municipal Library', 'Municipal Library - Research Assistance', 'Research assistance provided to library clients.', 221),
    ('Municipal Library', 'Municipal Library - Listing and Coding of Books', 'Books listed and coded in the library inventory.', 222),
    ('Municipal Library', 'Municipal Library - Covering Books', 'Books covered and prepared for circulation.', 223),
    ('Municipal Library', 'Municipal Library - DOST Reports', 'DOST library reports submitted during the period.', 224),
    ('Municipal Library', 'Municipal Library - NLP Reports', 'National Library of the Philippines reports submitted during the period.', 225),
    ('Municipal Library', 'Municipal Library - Space', 'Library space monitoring and upkeep accomplished during the period.', 226),
    ('E-Learning Ville', 'E-Learning Ville - Seminar / Meeting', 'Seminars and meetings assisted or set up at E-Learning Ville.', 231),
    ('E-Learning Ville', 'E-Learning Ville - Trainees', 'Trainees assisted at E-Learning Ville.', 232),
    ('E-Learning Ville', 'E-Learning Ville - Set Up', 'Room / equipment set up completed before client use.', 233)
) as extra(category, output, success_indicator, sort_order)
where not exists (
  select 1
  from public.opcr_items i
  where i.period_id = '11111111-1111-1111-1111-111111111111'
    and i.output = extra.output
);
