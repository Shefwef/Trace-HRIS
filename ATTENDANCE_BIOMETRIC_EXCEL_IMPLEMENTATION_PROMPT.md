# Claude Code Implementation Prompt --- Attendance, Off-Site Work Location, ZKTeco M2-LR Biometric Integration, and Excel Reports

You are working inside an existing production-oriented web application.
Your job is to inspect the repository first and then implement the
following three related features cleanly, without breaking existing
functionality.

I have also attached a screenshot of the exact biometric device
currently used in the office:

**ZKTeco M2-LR Attendance & Access Control Terminal With Wi-Fi**

The screenshot/configuration shows: - Model: M2-LR - Display: 2.8 inch -
User capacity: 3000 - Functions: Fingerprint, Card, Password -
Interfaces: USB Type-A, TCP/IP, Wi-Fi, Electric Lock, Door Sensor, Exit
Button - Warranty: 1 year

There is also an existing `BIOMETRIC_INTEGRATION.md` in the
project/history. If it exists in the repository, read it before
implementing anything and preserve useful decisions from it.

------------------------------------------------------------------------

## 0. NON-NEGOTIABLE WORKING RULES

### First inspect; do not guess

Before changing code:

1.  Inspect the entire repository structure relevant to:
    -   authentication/authorization
    -   employee/user management
    -   employee dashboard
    -   attendance
    -   reports
    -   database/schema/migrations
    -   API routes/server actions
    -   existing maps/location functionality
    -   existing UI component library
    -   existing implementation/architecture MD files
    -   existing biometric integration files
2.  Search for:
    -   `BIOMETRIC_INTEGRATION.md`
    -   `IMPLEMENTATION.md`
    -   `IMPLEMENTATION_GUIDE.md`
    -   `README.md`
    -   report-related MD files
    -   attendance-related MD files
    -   employee dashboard files
    -   existing PDF export code
    -   existing Excel/CSV export code
3.  Read the relevant files before editing.
4.  Identify the actual framework, ORM, database, authentication system,
    UI library, package manager, and deployment architecture from the
    repository.
5.  Reuse existing patterns wherever possible.
6.  Do not introduce a second architecture for something the project
    already has.
7.  Do not replace working components unnecessarily.
8.  Do not invent database fields or APIs without checking the existing
    schema.
9.  If an existing implementation is partially complete, extend it
    instead of creating a parallel implementation.
10. Run the project's existing lint/typecheck/test/build commands after
    implementation.

### Important

Do not pretend the physical biometric device is already connected. The
application must be **integration-ready now**, while the actual physical
device connection will be completed later when I have access to the
office device.

The implementation must therefore support:

-   a real biometric integration path,
-   a development/mock/simulation path,
-   clear device configuration,
-   clear synchronization status,
-   and a documented physical setup procedure.

------------------------------------------------------------------------

# FEATURE 1 --- EMPLOYEE WORK LOCATION / OFF-SITE OFFICE WORK

## 1. Business requirement

An employee normally works inside the office.

When the employee enters the office, they authenticate through the
biometric attendance device. That creates the employee's attendance
clock-in.

However, an employee may subsequently leave the office temporarily for
official work, for example:

-   Ministry
-   Government office
-   Health Ministry
-   Client office
-   Bank
-   Meeting location
-   Other approved external work destination

The employee is still working for the organization.

Therefore:

**Attendance presence and physical work location are two separate
concepts.**

Do NOT change the employee's clock-in time when their work location
changes.

Example:

``` text
08:58 AM
Employee fingerprints at office
→ Attendance clock-in = 08:58 AM
→ Current work location = Office

11:20 AM
Employee selects Ministry of Health on Google Maps
→ Attendance clock-in remains 08:58 AM
→ Current work location = Ministry of Health
→ Log created: OFFSITE_STARTED

03:45 PM
Employee returns to office
→ Attendance clock-in remains 08:58 AM
→ Current work location = Office
→ Log created: RETURNED_TO_OFFICE
```

This distinction is essential.

------------------------------------------------------------------------

## 2. Recommended dashboard UX

Add a compact **Current Work Location** card/section to the employee
dashboard.

Recommended presentation:

### When employee is in office

``` text
Current Work Location
● Office

Clocked in: 8:58 AM

[ Change Work Location ]
```

The primary professional action should be:

**Change Work Location**

When clicked, open a modal/drawer.

Do NOT make the employee navigate away from the dashboard.

### When employee is off-site

Show:

``` text
Current Work Location
● Off-site

Ministry of Health
Dhaka, Bangladesh

Started: 11:20 AM

[ Return to Office ]
[ Change Location ]
```

The primary return action should be:

**Return to Office**

The location card should remain visible near the bottom of the dashboard
as the user scrolls.

Use a polished, compact design consistent with the application's
existing UI.

------------------------------------------------------------------------

# 3. Location selection UX

Use Google Maps.

Preferred modern implementation:

-   Google Maps JavaScript API
-   Google Places functionality for search/autocomplete
-   `@vis.gl/react-google-maps` if compatible with the project's
    existing stack

If the project already contains a map package, evaluate it before adding
another one.

Do not install multiple overlapping map libraries.

The modal should contain:

1.  Search field
2.  Google Places autocomplete/search
3.  Interactive map
4.  Selected marker
5.  Selected place name
6.  Formatted address
7.  Optional purpose/reason
8.  Cancel button
9.  Confirm button

Example:

``` text
Set Work Location

Search destination
[ Ministry of Health                 ]

[ Google Map ]

Selected location:
Ministry of Health
Dhaka, Bangladesh

Purpose
[ Official meeting / government work ]

[ Cancel ] [ Start Off-site Work ]
```

Use the label:

**Start Off-site Work**

for the final confirmation action.

------------------------------------------------------------------------

# 4. Google Maps behavior

The employee should be able to:

-   search for a location,
-   select a Google Places result,
-   see it on the map,
-   adjust/select the marker if appropriate,
-   confirm the location.

Store, when available:

-   Google `placeId`
-   latitude
-   longitude
-   place name
-   formatted address
-   timestamp
-   employee ID
-   purpose/reason

Do not continuously track the employee's GPS location.

This feature is **work-destination selection**, not surveillance.

The application should record the location the employee selected for
official work.

------------------------------------------------------------------------

# 5. Location data model

Inspect the existing database first.

Implement the equivalent of these concepts using the project's naming
conventions.

### Current state

There must be a reliable way to determine:

``` text
employee.currentWorkLocation
```

Possible conceptual values:

``` text
OFFICE
OFFSITE
```

### Immutable location history

Create an event/log model equivalent to:

``` text
EmployeeWorkLocationEvent

id
employeeId
eventType
previousLocationType
newLocationType

placeId
placeName
formattedAddress
latitude
longitude

purpose

startedAt
endedAt

createdAt
createdBy
```

Event types should include at minimum:

``` text
OFFICE_CLOCK_IN
OFFSITE_STARTED
RETURNED_TO_OFFICE
OFFSITE_LOCATION_CHANGED
```

Adapt this to the project's actual schema conventions.

Do not duplicate location state in multiple unrelated tables unless
there is a clear architectural reason.

------------------------------------------------------------------------

# 6. Location rules

### Rule 1 --- Clock-in defaults to Office

Every successful attendance clock-in should default the current work
location to:

``` text
OFFICE
```

Create a location event:

``` text
OFFICE_CLOCK_IN
```

### Rule 2 --- Off-site work does not modify attendance clock-in

Changing location must never modify:

-   clock-in timestamp
-   clock-out timestamp
-   attendance session start
-   biometric event timestamp

### Rule 3 --- Only one active location

At any moment an employee can have only one current work location.

### Rule 4 --- Cannot start off-site work before clock-in

If the employee has not clocked in for the day, the application should
not allow an off-site work location to be started unless the existing
attendance policy explicitly supports it.

### Rule 5 --- Cannot return to office if already in office

Hide/disable the return action.

### Rule 6 --- Changing an off-site destination

If already off-site and the employee needs to go somewhere else,
provide:

**Change Location**

This creates:

``` text
OFFSITE_LOCATION_CHANGED
```

and closes the previous location period.

### Rule 7 --- End-of-day safety

If an employee forgets to return to office before clock-out, do not
silently alter historical records.

Instead, handle this through an explicit business rule and make the
state visible to HR/admin.

------------------------------------------------------------------------

# 7. Admin/HR visibility

Senior Admin, HR, and authorized administrators should be able to see:

-   employee name
-   employee ID
-   current work location
-   Office / Off-site status
-   destination
-   selected address
-   start time
-   current duration
-   purpose
-   last location change
-   return time when completed

Add a location history/audit view.

Example:

``` text
Employee: John Doe

08:58 AM
Office
Clocked in

11:20 AM
Ministry of Health
Off-site work started

03:45 PM
Office
Returned
```

This is the audit trail that proves:

> The employee was clocked in at the office and subsequently recorded as
> working at an external official destination.

------------------------------------------------------------------------

# 8. Permissions

Employees can:

-   view their current location,
-   change their own work location,
-   return to office.

HR/Admin/Senior Admin can:

-   view employee locations,
-   view history,
-   filter by date,
-   inspect location changes,
-   optionally correct an erroneous record through a controlled/admin
    action.

Do not allow ordinary employees to edit historical events.

Administrative corrections must be auditable.

------------------------------------------------------------------------

# FEATURE 2 --- ZKTECO M2-LR BIOMETRIC ATTENDANCE INTEGRATION

## 9. Device facts to use

The attached device is:

**ZKTeco M2-LR Attendance & Access Control Terminal With Wi-Fi**

Known configuration:

-   Model: M2-LR
-   2.8-inch display
-   up to 3000 users in the supplied configuration
-   fingerprint/card/password authentication
-   TCP/IP
-   Wi-Fi
-   USB Type-A
-   ADMS support
-   attendance log storage
-   electric lock/door sensor/exit button interfaces

The current device documentation indicates ADMS/cloud-server
configuration and support for ZKBio Time.

Do not assume that a generic old ZKTeco SDK is the correct integration
path for this exact device.

First inspect the firmware/protocol when the physical device is
available.

------------------------------------------------------------------------

# 10. Recommended biometric architecture

Do NOT put raw device protocol logic directly throughout the main web
application.

Use an isolated integration layer:

``` text
ZKTeco M2-LR
        |
        | ADMS / PUSH
        v
Biometric Integration Service
        |
        | normalize
        | validate
        | deduplicate
        v
Application Database
        |
        +---- Attendance
        +---- Employee mapping
        +---- Device health
        +---- Sync logs
        |
        v
Web Application
```

If the existing office software currently controls the device, support
this fallback:

``` text
ZKTeco M2-LR
        |
        v
Existing ZKTeco / attendance middleware
        |
        | official API
        v
Application integration layer
        |
        v
Application database
```

Do not break the existing production attendance system.

------------------------------------------------------------------------

# 11. Build a biometric device abstraction

Create an abstraction similar to:

``` text
BiometricDevice
BiometricDeviceUser
BiometricAttendanceEvent
BiometricSyncLog
```

Use the project's existing database naming conventions.

Conceptually:

### BiometricDevice

``` text
id
name
model
serialNumber
firmwareVersion
ipAddress
protocol
status
lastSeenAt
createdAt
updatedAt
```

### BiometricDeviceUser

``` text
id
deviceId
employeeId
deviceUserId
active
createdAt
updatedAt
```

### BiometricAttendanceEvent

``` text
id
deviceId
deviceUserId
employeeId

eventTime
eventType
verificationMethod

sourceEventId
rawPayload
receivedAt

createdAt
```

### BiometricSyncLog

``` text
id
deviceId
direction
status
message
metadata
createdAt
```

Adapt names/types to the actual application.

------------------------------------------------------------------------

# 12. Employee/device mapping

Never map biometric users by employee name.

Use:

``` text
deviceUserId → employeeId
```

The application must have an explicit mapping.

Example:

``` text
Device user ID: 10027
Employee: EMP-0042
```

This is critical for reliable attendance.

------------------------------------------------------------------------

# 13. Fingerprint data security

The application should NOT store raw fingerprint images/templates merely
to display attendance.

The M2-LR should perform fingerprint verification.

The application should receive the attendance result:

``` text
employee/device user
timestamp
verification method
device
```

Avoid importing biometric templates into the web application's normal
database unless a future vendor-supported and security-reviewed
requirement explicitly requires it.

------------------------------------------------------------------------

# 14. Attendance ingestion

Implement an ingestion pipeline:

``` text
Receive
  ↓
Authenticate/validate
  ↓
Identify device
  ↓
Parse event
  ↓
Normalize timestamp
  ↓
Resolve device user
  ↓
Deduplicate
  ↓
Store event
  ↓
Create/update attendance session
  ↓
Default current work location to OFFICE
```

------------------------------------------------------------------------

# 15. Idempotency

This is mandatory.

The same biometric punch may be delivered more than once.

Use the device's transaction/event ID when available.

Otherwise create a deterministic key using an appropriate combination
of:

``` text
deviceId
deviceUserId
eventTime
eventType
```

Never create duplicate attendance records because the device retried
delivery.

------------------------------------------------------------------------

# 16. Development mode before physical device access

Because the physical device is currently unavailable, create a
development/test adapter.

It should allow an authorized developer/admin to simulate:

``` text
CLOCK_IN
CLOCK_OUT
```

for a selected employee.

The simulated event must pass through the same normalization and
attendance service used by real biometric events.

Do not create a completely separate fake attendance implementation.

The only difference should be the event source:

``` text
MOCK
DEVICE
```

This allows the rest of the application to be developed and tested now.

------------------------------------------------------------------------

# 17. Physical integration checklist

When I physically access the office device, I will need to:

1.  Record serial number.
2.  Record firmware version.
3.  Record device IP.
4.  Record subnet/gateway/DNS.
5.  Determine whether Ethernet or Wi-Fi is being used.
6.  Determine current communication protocol.
7.  Determine whether another attendance system is currently receiving
    the device data.
8.  Screenshot current ADMS/cloud server settings.
9.  Back up/export existing attendance data where possible.
10. Test network connectivity.
11. Configure the correct ADMS/PUSH destination if the device is being
    dedicated to the new system.
12. Register the device in the application.
13. Map an existing employee to a device user.
14. Perform one fingerprint punch.
15. Confirm the event reaches the integration service.
16. Confirm the employee mapping.
17. Confirm attendance creation.
18. Confirm the employee's location defaults to Office.
19. Test duplicate handling.
20. Test offline/retry behavior.
21. Test with multiple employees.
22. Only then perform production rollout.

Create/update `BIOMETRIC_INTEGRATION.md` with the exact
commands/settings discovered during implementation.

------------------------------------------------------------------------

# 18. Device health dashboard

For HR/Admin/Senior Admin, create a small device status area.

Show:

``` text
Biometric Device
● Online

Last synchronization:
2 minutes ago

Device:
M2-LR

Serial:
XXXXXXXX

Pending events:
0
```

Possible states:

``` text
ONLINE
OFFLINE
SYNCING
ERROR
UNCONFIGURED
```

Do not expose sensitive network credentials.

------------------------------------------------------------------------

# FEATURE 3 --- REPORTS: EXCEL-FIRST EXPORT

## 19. Business requirement

The current Reports section primarily provides PDFs.

For this office, Excel/spreadsheet format is more useful because the
data is heavily numerical and employees already work with Excel.

Therefore:

**Excel/XLSX becomes the primary report export format.**

PDF should not be removed blindly if existing functionality depends on
it. First inspect usage.

If the application architecture allows it cleanly, make XLSX the default
primary action and retain PDF only as an optional secondary action until
explicitly removed.

------------------------------------------------------------------------

# 20. Excel library

Inspect existing dependencies first.

If no suitable library exists, prefer a robust server-side XLSX library
compatible with the current stack, such as:

**ExcelJS**

Use the project's existing package manager.

Do not add multiple spreadsheet libraries.

------------------------------------------------------------------------

# 21. Report UX

Replace a PDF-first action such as:

``` text
Download PDF
```

with:

``` text
Export Excel
```

For reports with multiple useful datasets, generate a workbook with
multiple sheets.

Example:

``` text
Attendance Report.xlsx

Sheet 1: Attendance Summary
Sheet 2: Daily Attendance
Sheet 3: Off-site Work
Sheet 4: Location History
Sheet 5: Employee Summary
```

Do not add unnecessary sheets to reports that do not need them.

------------------------------------------------------------------------

# 22. Excel formatting

The workbook should be professional and immediately usable.

Include:

-   readable column widths
-   bold header rows
-   frozen header row
-   filters
-   date/time formatting
-   numeric formatting
-   percentage formatting where relevant
-   currency formatting where relevant
-   totals where meaningful
-   consistent sheet naming
-   meaningful workbook filename

Do not dump raw JSON into Excel.

------------------------------------------------------------------------

# 23. Excel export architecture

Prefer:

``` text
UI
 ↓
Report export API/server action
 ↓
Report query/service
 ↓
Excel workbook builder
 ↓
XLSX response
 ↓
Browser download
```

Keep report calculation logic separate from workbook formatting logic.

This allows the same report data to later support:

-   dashboard tables
-   Excel
-   PDF
-   CSV
-   APIs

------------------------------------------------------------------------

# 24. Report filters

Reuse the application's existing report filters.

At minimum preserve appropriate filters such as:

-   date range
-   employee
-   department/team
-   attendance status
-   work location
-   report type

The exported workbook must represent exactly the filtered dataset
shown/selected by the user.

Do not export a different dataset from the UI.

------------------------------------------------------------------------

# 25. Suggested attendance Excel report

Example columns:

``` text
Employee ID
Employee Name
Department
Date
Clock In
Clock Out
Total Hours
Attendance Status
Initial Location
Current/Final Location
Off-site Work
Off-site Duration
```

Use actual project fields and naming conventions rather than inventing
data.

------------------------------------------------------------------------

# 26. Suggested off-site location Excel report

Columns:

``` text
Employee ID
Employee Name
Date
Event
Location Name
Address
Latitude
Longitude
Purpose
Started At
Ended At
Duration
Changed By
```

This report should be useful for HR/admin auditing.

------------------------------------------------------------------------

# 27. Filename conventions

Use professional filenames, for example:

``` text
attendance-report-2026-08-01-to-2026-08-25.xlsx
offsite-work-report-2026-08-01-to-2026-08-25.xlsx
employee-attendance-report-EMP-0042.xlsx
```

Use the application's actual date/time conventions.

------------------------------------------------------------------------

# 28. API/security requirements for reports

Export endpoints must:

-   enforce authentication,
-   enforce authorization,
-   validate filters,
-   avoid exposing other departments/employees to unauthorized users,
-   use server-side data access,
-   avoid trusting client-supplied employee IDs for authorization,
-   stream or generate the workbook efficiently for larger reports.

Do not load an unnecessarily huge dataset into the browser.

------------------------------------------------------------------------

# CROSS-FEATURE DATA CONSISTENCY

The three features must work together.

Example:

``` text
08:58
Fingerprint at M2-LR
        ↓
Attendance clock-in
        ↓
Current work location = OFFICE

11:20
Employee clicks Change Work Location
        ↓
Google Maps
        ↓
Selects Ministry of Health
        ↓
Current work location = OFFSITE
        ↓
OFFSITE_STARTED log

15:45
Employee clicks Return to Office
        ↓
Current work location = OFFICE
        ↓
RETURNED_TO_OFFICE log

17:05
Fingerprint at M2-LR
        ↓
Attendance clock-out
```

The resulting attendance record should retain:

``` text
Clock in: 08:58
Clock out: 17:05
```

while the location history independently records:

``` text
08:58 Office
11:20 Ministry of Health
15:45 Office
```

------------------------------------------------------------------------

# DATABASE / TRANSACTIONAL INTEGRITY

Where a single user action changes multiple pieces of state, use a
database transaction where supported.

For example, starting off-site work should atomically:

1.  close the previous active location state,
2.  create the new location event,
3.  update current location.

Returning to office should atomically:

1.  close the off-site period,
2.  create the return event,
3.  update current location to Office.

Biometric attendance ingestion should also use transaction/idempotency
protection so that retries cannot create duplicate records.

------------------------------------------------------------------------

# AUDITABILITY

The following actions must be auditable:

-   biometric event received
-   biometric event rejected
-   device connected/disconnected
-   device configuration changed
-   employee/device mapping changed
-   off-site location started
-   off-site location changed
-   returned to office
-   admin correction
-   report exported where the existing application has an audit
    framework

Use the project's existing audit-log infrastructure if available.

------------------------------------------------------------------------

# IMPLEMENTATION ORDER

Implement in this order:

## Phase 1 --- Repository analysis

-   inspect architecture
-   inspect existing MD documentation
-   inspect attendance
-   inspect employee dashboard
-   inspect reports
-   inspect database
-   inspect dependencies

## Phase 2 --- Data model

Implement the minimum required models/migrations.

## Phase 3 --- Work-location backend

Implement:

-   current state
-   location event history
-   authorization
-   transactions
-   validation

## Phase 4 --- Google Maps UI

Implement:

-   dashboard location card
-   map modal
-   Places search
-   destination confirmation
-   return-to-office action
-   loading/error states

## Phase 5 --- Biometric abstraction

Implement:

-   device model
-   device-user mapping
-   event model
-   sync logs
-   mock adapter
-   ingestion service
-   idempotency

## Phase 6 --- Physical device readiness

Implement configuration screens/fields and the ADMS/PUSH integration
boundary, but do not claim physical connectivity until the device is
actually tested.

## Phase 7 --- Excel reports

Implement:

-   Excel builder
-   export endpoints/actions
-   report filters
-   workbook formatting
-   download UI

## Phase 8 --- Testing

Test:

-   employee permissions
-   admin permissions
-   location transitions
-   duplicate events
-   invalid map selection
-   missing Google API key
-   biometric mock events
-   biometric duplicate events
-   offline device state
-   Excel exports
-   large reports
-   authorization boundaries

## Phase 9 --- Documentation

Update the existing implementation documentation.

If the repository contains:

``` text
BIOMETRIC_INTEGRATION.md
IMPLEMENTATION.md
IMPLEMENTATION_GUIDE.md
```

update the appropriate file rather than creating redundant
documentation.

Document:

-   architecture
-   database changes
-   API routes
-   environment variables
-   Google Maps setup
-   biometric device setup
-   ADMS/PUSH configuration
-   device-user mapping
-   mock testing
-   production testing
-   Excel export
-   troubleshooting
-   rollback

Also create/update a dedicated physical-office runbook named something
like:

``` text
BIOMETRIC_FINGERPRINT_INTEGRATION_STEPS.md
```

if one does not already exist.

------------------------------------------------------------------------

# ENVIRONMENT VARIABLES

Inspect existing environment variable conventions.

For Google Maps, use an appropriately restricted browser key,
e.g. conceptually:

``` text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
```

Do not expose server secrets.

If server-side Google APIs are required, use a separate server-side
credential.

Do not hard-code keys.

For biometric integration, use server-side configuration such as:

``` text
BIOMETRIC_INTEGRATION_ENABLED
BIOMETRIC_ADMS_BASE_URL
BIOMETRIC_ADMS_PORT
BIOMETRIC_DEVICE_SECRET
```

only if actually required by the chosen architecture.

Use names consistent with the project's existing conventions.

------------------------------------------------------------------------

# GOOGLE MAPS KEY RESTRICTIONS

The browser key should be restricted by:

-   allowed HTTP referrers/domains
-   only required Google APIs

Do not create an unrestricted Google API key.

If the application is deployed locally during development, document
localhost restrictions separately.

------------------------------------------------------------------------

# ERROR HANDLING

Every new feature must have professional loading/error/empty states.

Examples:

### Maps

``` text
Unable to load Google Maps.
Please try again or contact your administrator.
```

### Biometric

``` text
Biometric device is currently offline.
The last successful synchronization was 8 minutes ago.
```

### Excel

``` text
Unable to generate the report.
Please try again.
```

Do not show raw stack traces to normal users.

------------------------------------------------------------------------

# UI QUALITY

The implementation should match the application's existing design
system.

Do not create a visually disconnected module.

Use:

-   existing buttons
-   existing cards
-   existing modal/dialog components
-   existing toast/notification system
-   existing typography
-   existing spacing
-   existing icons

Make the dashboard responsive.

The location card should work on desktop and mobile.

The map modal should be responsive and usable on smaller screens.

------------------------------------------------------------------------

# IMPORTANT SECURITY/PRIVACY PRINCIPLE

The location feature records **official work destinations selected by
employees**.

It is not intended to continuously track their personal movement.

Do not implement background GPS tracking unless explicitly requested in
a future requirement.

Biometric data should also be minimized: the web app needs attendance
events and employee/device mapping, not raw fingerprint
images/templates.

------------------------------------------------------------------------

# ACCEPTANCE CRITERIA

The work is complete only when all of the following are true:

### Work location

-   [ ] Employee clocks in through attendance/biometric flow.
-   [ ] Clock-in defaults location to Office.
-   [ ] Dashboard shows current work location.
-   [ ] Employee can click Change Work Location.
-   [ ] Google Maps opens in a modal/drawer.
-   [ ] Employee can search a destination.
-   [ ] Employee can select a place.
-   [ ] Selected place appears on map.
-   [ ] Employee can confirm Start Off-site Work.
-   [ ] Current location changes to Off-site.
-   [ ] Location history is recorded.
-   [ ] Employee can Return to Office.
-   [ ] Return is recorded.
-   [ ] Clock-in/out timestamps remain unchanged.
-   [ ] HR/Admin can see current and historical work locations.
-   [ ] Employees cannot edit historical records.

### Biometric

-   [ ] Application has biometric device abstraction.
-   [ ] M2-LR is represented as a device.
-   [ ] Device user IDs map explicitly to employees.
-   [ ] Mock biometric events work before physical device access.
-   [ ] Real-device integration boundary is implemented.
-   [ ] ADMS/PUSH architecture is documented.
-   [ ] Incoming events are validated.
-   [ ] Duplicate events are prevented.
-   [ ] Device health can be monitored.
-   [ ] No unnecessary raw fingerprint data is stored.
-   [ ] Physical integration runbook is documented.

### Excel

-   [ ] Reports support XLSX export.
-   [ ] Excel is the primary report export format.
-   [ ] Existing report filters are respected.
-   [ ] Workbook formatting is professional.
-   [ ] Headers are frozen.
-   [ ] Filters are available.
-   [ ] Dates/times/numbers are properly formatted.
-   [ ] Authorization is enforced.
-   [ ] Large reports do not unnecessarily run in the browser.
-   [ ] Existing PDF functionality is preserved or intentionally removed
    only after confirming there are no dependencies.

### Documentation

-   [ ] Existing implementation MD is updated.
-   [ ] Biometric integration documentation is updated.
-   [ ] Google Maps setup is documented.
-   [ ] Environment variables are documented.
-   [ ] Database changes are documented.
-   [ ] API changes are documented.
-   [ ] Physical device setup is documented.
-   [ ] Testing procedure is documented.
-   [ ] Rollback/troubleshooting procedure is documented.

------------------------------------------------------------------------

# FINAL INSTRUCTION

Do not stop at giving me an implementation plan.

Inspect the repository, determine the existing architecture, and
implement the features.

If something is uncertain, resolve it from the existing codebase,
official ZKTeco documentation, or the actual installed package/version
before making a design decision.

Do not replace working application behavior unnecessarily.

After implementation:

1.  run lint,
2.  run type checking,
3.  run tests if available,
4.  run the production build if practical,
5.  fix errors,
6.  review the changed files for consistency,
7.  update the implementation MD documentation,
8.  clearly report:
    -   files changed,
    -   database migrations,
    -   packages added,
    -   environment variables added,
    -   routes/API endpoints added,
    -   Google Maps setup required,
    -   biometric setup still requiring physical device access,
    -   tests performed,
    -   and any remaining manual steps.

Do not claim that the M2-LR is physically integrated until a real device
test has succeeded.
