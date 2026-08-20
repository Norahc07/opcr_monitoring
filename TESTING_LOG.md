# OPCR Monitoring System — Testing Log

**Office:** E-Learning Ville, LGU Mauban, Quezon  
**System:** Office Performance Commitment and Review (OPCR)  
**Tester:** ______________________________  
**Date:** ______________________________  
**Admin account used:** ______________________________  
**Staff account used:** ______________________________  
**Overall result:** ☐ Passed    ☐ Passed with notes    ☐ Failed

---

## How to mark results

For each item, tick **Pass** or **Fail**, then write notes if needed.

---

## A. Device access

**A1.** Open the system on a phone.  
Expected: “Desktop only” screen. No login.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**A2.** Open the system on a tablet or iPad.  
Expected: Same “Desktop only” screen.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**A3.** Open the system on a desktop or laptop (window wider than 1100px).  
Expected: Login page or the app loads.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**A4.** Shrink the desktop window below 1100px.  
Expected: “Desktop only” screen appears.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**A5.** Widen the window again.  
Expected: The app returns.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## B. Login and session

**B1.** Check the login page heading.  
Expected: “Office Performance Commitment and Review (OPCR)”  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B2.** Sign in with a wrong password.  
Expected: Error message. Stay on login.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B3.** Try to sign in with empty email or password.  
Expected: Browser required-field check.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B4.** Sign in with an admin account.  
Expected: Goes to Tally board. Header shows name and Admin.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B5.** Sign in with a staff account.  
Expected: Goes to Tally board. Header shows name and Staff. No Users menu.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B6.** Refresh the page while logged in.  
Expected: Stay logged in.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B7.** Click Sign out.  
Expected: Back to login. Cannot open the app without signing in.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**B8.** As staff, type /users in the address bar.  
Expected: Cannot open the Users page.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## C. Header and navigation

**C1.** Check the sidebar.  
Expected: Tally board, My OPCR, Profile. Admin also sees Users and Audit logs. Staff does not.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**C2.** Check the header name.  
Expected: Account full name. Not the OPCR form signer name.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**C3.** Check the header photo.  
Expected: Profile photo if uploaded; otherwise initials.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**C4.** Click the header name or photo.  
Expected: Opens Profile.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**C5.** Scroll down a long page, then use Back to top.  
Expected: Button appears after scrolling and returns to the top.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## D. Users (admin only)

**D1.** Open Users.  
Expected: One list titled Staffs. No separate Login accounts section.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**D2.** Check who is listed.  
Expected: Only people with a real Supabase login. Admin is included.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**D3.** Check names that have no login account.  
Expected: They do not appear in Staffs.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**D4.** Check profile photos on Users.  
Expected: Uploaded staff photos display in the list.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**D5.** Add a new staff (email, password, name, position, role).  
Expected: Account is created and appears in Staffs and on the tally board.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**D6.** Edit a staff name, position, or role. Save. Refresh Tally board.  
Expected: Changes save. Tally column header updates.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**D7.** Delete another staff. Try to delete your own admin account.  
Expected: Other staff is removed. You cannot delete yourself.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## E. Tally board — Target (admin)

**E1.** Check the toggle labels.  
Expected: Target and Accomplishments.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**E2.** Open Target view.  
Expected: Staff columns and Total target. No “Total for Jan–Dec” column.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**E3.** Check core function names.  
Expected: Same names as My OPCR, from Training Facilitated to E-Learning Ville (Clients Assisting).  
☐ Pass    ☐ Fail  
Notes: ________________________________

**E4.** Check if admin has a tally column.  
Expected: Admin is included on the tally board.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**E5.** Enter targets for each person for January–June and July–December. Click Save targets.  
Expected: Toast confirms targets saved.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**E6.** Refresh the page.  
Expected: Targets are still there.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**E7.** As staff, try to edit another person’s target.  
Expected: Staff cannot edit other people’s targets.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## F. Tally board — Accomplishments

**F1.** Switch to Accomplishments.  
Expected: Each cell shows the saved target under the count.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F2.** Enter a count below the target.  
Expected: The number and Target text are red.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F3.** Enter a count equal to or above the target.  
Expected: The number and Target text are green.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F4.** Check semester total and Total for Jan–Dec.  
Expected: Same red or green color against the combined targets.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F5.** As staff, type counts in your own column.  
Expected: Own column is highlighted. Saves automatically. Admin can see it.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F6.** As staff, try to type in another person’s column.  
Expected: Read-only. Cannot edit.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F7.** Open staff and admin in two browsers. Staff saves a count.  
Expected: Admin tally updates.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**F8.** As admin, on Accomplishments, type counts in other staff columns.  
Expected: All staff columns are editable. Counts save automatically. Refresh keeps the numbers.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## G. My OPCR

**G1.** Open My OPCR.  
Expected: Title, commitment text, year, and name/position on the right.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**G2.** Edit name and position on the OPCR form. Save. Check the header.  
Expected: Form saves. Header name does not change.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**G3.** Edit Approved by (mayor name, position, date). Save. Refresh.  
Expected: Values are still there.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**G4.** Check all four core function sections.  
Expected: Names match the tally. Success indicators are readable.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**G5.** Enter actual accomplishments and remarks. Save. Refresh.  
Expected: Text is still there.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**G6.** Fill comments and closing dates (discussed, assessed, final rating). Save. Refresh.  
Expected: Values are still there.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**G7.** If ratings Q, E, and T are entered.  
Expected: Average (A) is shown.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## H. Print OPCR

**H1.** Click Print.  
Expected: Print dialog opens. Sidebar and Edit/Save are hidden.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**H2.** In the print dialog, set paper.  
Expected: Long bond 8.5 × 13 inches, Landscape.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**H3.** Check number of pages.  
Expected: 5 pages (4 core sections + closing).  
☐ Pass    ☐ Fail  
Notes: ________________________________

**H4.** Check page 1.  
Expected: Header, Approved by, and Section 1 all fit. Client Assistance is not cut off.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**H5.** Check pages 2 to 4.  
Expected: Remaining core sections. Columns aligned: Output, Success Indicator, Actual Accomplishments, Q, E, T, A, Remarks.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**H6.** Check page 5.  
Expected: Final average, comments, signatures, and legend.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**H7.** Check table alignment.  
Expected: Columns line up across sections. No extra empty columns.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## I. Profile

**I1.** Open Profile.  
Expected: Name, email, position, office, and role are shown.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**I2.** Upload a photo, crop 2×2, and save.  
Expected: Photo saves. Header photo updates.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**I3.** Take a picture with the camera, crop, and save.  
Expected: Photo saves.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**I4.** As admin, open Users.  
Expected: The new photo shows for that staff.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## J. Data and security

**J1.** Save tally and OPCR, then hard refresh (Ctrl + F5).  
Expected: Data is still there.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**J2.** Sign out and sign in again.  
Expected: Data is still there.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**J3.** Compare staff and admin.  
Expected: Staff has no Users or Audit logs menu and cannot set other people’s targets or accomplishments. Admin has full tally (including typing in every staff column), Users, and Audit logs.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**J4.** Open /admin in the address bar.  
Expected: Redirects to Tally board. No Overview page.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## K. Audit logs (admin only)

Run `supabase/audit.sql` in the SQL editor once before this section.

**K1.** As staff, open `/audit` in the address bar.  
Expected: Redirected away. No Audit logs menu.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**K2.** As admin, open Audit logs.  
Expected: Table of recent activity (or empty-state with setup note). Filters: All, Login, Tally, OPCR, Users, Profile.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**K3.** Sign out, then sign in as admin. Refresh Audit logs.  
Expected: “Signed out” then “Signed in” on Login.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**K4.** Save a tally target or accomplishment. Refresh Audit logs. Filter Tally.  
Expected: “Saved targets” or “Saved accomplishments” on Tally board.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**K5.** Save My OPCR. Refresh Audit logs. Filter OPCR.  
Expected: “Saved OPCR” on My OPCR.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**K6.** Create or update a staff account on Users. Filter Users.  
Expected: “Created staff” or “Updated staff”.  
☐ Pass    ☐ Fail  
Notes: ________________________________

**K7.** Update a profile photo. Filter Profile.  
Expected: “Updated profile photo”.  
☐ Pass    ☐ Fail  
Notes: ________________________________

---

## Suggested test order

1. A — Device access  
2. B and C — Login and navigation (admin)  
3. D — Users  
4. E then F — Tally (admin, then staff)  
5. G and H — My OPCR and print  
6. I — Profile  
7. J — Data and security  
8. K — Audit logs

---

## Issues found

1. ________________________________  
2. ________________________________  
3. ________________________________  
4. ________________________________  
5. ________________________________

---

## Sign-off

Tester name: ______________________________  
Signature: ______________________________  
Date: ______________________________  
Final result: ☐ Passed    ☐ Passed with notes    ☐ Failed
