# Analytics

The site reports to Google Analytics (GA4) through the Firebase JS SDK, from
one module: `app/src/analytics.ts`. The SDK loads on demand, so it adds nothing
to the first page load.

Nothing personal is sent: no user id, email, project or poster names, images
or ids. Project pages are logged under fixed names (`/project_editor`,
`/project_viewer`), never their real URL. Ad features are off (no advertising
id, no ad personalization). Anyone can turn it off per browser with the
**Share anonymous usage stats** checkbox at the bottom of the home page.

Analytics is off unless the build has all four Firebase values below, so local
dev (`npm run dev:env`) and forks send nothing.

## One-time setup

1. **Firebase project.** In the [Firebase console](https://console.firebase.google.com),
   **Add project** (e.g. `poster-walls`) and leave **Enable Google Analytics**
   on, creating a new GA4 property for it. To add Analytics to an existing
   project instead: ⚙ **Project settings → Integrations → Google Analytics →
   Enable**.
2. **Web app.** **Project settings → General → Your apps → Add app → Web**
   (no Firebase Hosting needed). From the config it shows, add these under the
   repo's **Settings → Secrets and variables → Actions**, as secrets or
   variables (either works; they ship inside the site anyway):

   | Repo secret or variable    | Firebase config field |
   | -------------------------- | --------------------- |
   | `FIREBASE_WEB_API_KEY`     | `apiKey`              |
   | `FIREBASE_PROJECT_ID`      | `projectId`           |
   | `FIREBASE_WEB_APP_ID`      | `appId`               |
   | `FIREBASE_MEASUREMENT_ID`  | `measurementId`       |

   The next deploy turns it on.
3. **In Google Analytics** ([analytics.google.com](https://analytics.google.com)):
   - **Admin → Data streams →** the web stream **→ Enhanced measurement →
     Page views → Show advanced settings**: turn off **Page changes based on
     browser history events**. The app logs its own page views, so leaving it
     on double-counts them and leaks real project URLs.
   - **Admin → Custom definitions → Create custom dimension** (event scope)
     for `poster_shape`, `has_image`, `obstruction_kind`, `length_mode` and
     `visibility`, so they show up in reports.

## Where to look

- **Realtime** (GA → Reports → Realtime): the last 30 minutes. Best first
  check after a deploy.
- **Pages and screens** (GA → Reports → Engagement): which pages get used.
  Set the table's dimension to **Page title and screen name**.
- **Events** (GA → Reports → Engagement → Events): counts for each event
  below. Click one to break it down by its params.
- **Explore** (GA → Explore): build your own tables, e.g. a funnel from
  `project_created` to `wall_added` to `poster_placed` to `dimensions_printed`.

Standard reports lag by up to a day; Realtime and DebugView are instant.

## Checking events with DebugView

Install the Google Analytics Debugger Chrome extension, switch it on, reload
the site, and open GA → **Admin → DebugView**. Click around and each
`page_view` and event below appears as it's sent.

## Events

| Event                        | When it fires                                  | Params                                         |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `page_view`                  | A page opens                                   | page name (see below)                          |
| `project_created`            | A project is made                              | none                                           |
| `wall_added`                 | A wall is added to a project                   | none                                           |
| `obstruction_added`          | A door, window, outlet etc. is marked on a wall | `obstruction_kind`: `door` / `window` / `outlet` / `generic` |
| `poster_added`               | A poster joins a project's library             | `poster_shape`: `rect` / `circle` / `diamond`; `has_image`: `yes` / `no` |
| `poster_image_set`           | An image is set on an existing poster          | none                                           |
| `poster_placed`              | A poster is put on a wall (not every drag)     | none                                           |
| `dimensions_printed`         | The dimensions PDF is downloaded               | `length_mode`: `inches` / `feet-inches`        |
| `project_visibility_changed` | A project is made public or private            | `visibility`: `public` / `private`             |

Page names: `home`, `projects`, `project_editor` (your own project),
`project_viewer` (someone else's public project). Each is a page view whose
title and path are that name.
Firebase also logs its own automatic events, like `first_visit`,
`session_start` and `user_engagement`.

## Adding an event

1. Add it to `AnalyticsEvents` in `app/src/analytics.ts` with its params.
   Event and param names are `snake_case`, up to 40 characters. Params should be
   a few fixed values (a type, yes/no), never anything a person typed or an id.
2. Call `logEvent('your_event', { ... })` where the action succeeds: a
   mutation's `onSuccess` in `app/src/api/queries.ts`, or the `onSuccess`
   option of a `mutate` call when only some uses of that mutation count.
3. To see a new param in reports, add it as a custom dimension in GA (setup
   step 3).
4. Check it in DebugView, then add a row to the table above.

For a new page, call `useScreenView('page_name')` at the top of its route
component.
