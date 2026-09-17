<template>
  <v-container class="fill-height">
    <v-row align-center>
      <v-col class="text-center" cols="12" sm="10" offset-sm="1" lg="6" offset-lg="3">
        <settings-page-title
          section="account"
          title="API & Account"
          color="yellow-darken-3"
          :chips="navChips"
        />

        <settings-group title="Sites" anchor="sites">
          <settings-row stack>
            <p class="text-left text-body-2 mb-0">
              Each site keeps its own credentials, starred tags, blacklist, saved searches, and history.
              Pick a site in the sidebar; Unified mixes the children you enable below.
            </p>
            <v-btn
              class="mt-2 px-0"
              variant="text"
              color="accent"
              size="small"
              @click="showSitesMore = !showSitesMore"
            >
              {{ showSitesMore ? "Less" : "More" }}
            </v-btn>
            <v-expand-transition>
              <p v-if="showSitesMore" class="text-left text-caption text-medium-emphasis mt-1 mb-0">
                <template v-if="siteMode.supportsLocalMode">
                  Local browse folder is under Posts → Save &amp; Local (separate from Save Locally).
                </template>
                Tailspace login uses a password or a pasted <code>tailspace_session</code> cookie
                (password is not stored).
              </p>
            </v-expand-transition>
          </settings-row>
        </settings-group>

        <settings-group
          title="Copy starred tags / blacklist"
          description="One-shot copy into the currently active site mode."
          anchor="sync"
        >
          <settings-row :title="`Into ${activeModeLabel}`" stack>
            <div class="text-left mb-4">
              <div class="text-subtitle-2 mb-1">Starred tags</div>
              <profile-list-sync kind="favorites" />
            </div>
            <div class="text-left">
              <div class="text-subtitle-2 mb-1">Blacklist</div>
              <profile-list-sync kind="blacklist" />
            </div>
          </settings-row>
        </settings-group>

        <settings-group
          title="Unified feed"
          description="Uses each site's login when present, otherwise guest search. Following merges watch feeds from Inkbunny, FurAffinity, Itaku, and SoFurry only."
          anchor="unified"
        >
          <settings-row title="Source">
            <v-btn-toggle
              color="accent"
              density="compact"
              divided
              mandatory
              :model-value="siteMode.unifiedFeedSource"
              @update:model-value="onUnifiedFeedSource"
            >
              <v-btn value="search" size="small">Search</v-btn>
              <v-btn value="following" size="small">Following</v-btn>
            </v-btn-toggle>
          </settings-row>
          <settings-row title="Presets">
            <div class="d-flex flex-wrap ga-2">
              <v-btn size="small" variant="text" color="accent" @click="siteMode.applyUnifiedSitesPreset('default')">
                Defaults
              </v-btn>
              <v-btn size="small" variant="text" color="accent" @click="siteMode.applyUnifiedSitesPreset('authenticated')">
                Auth only
              </v-btn>
            </div>
          </settings-row>
          <settings-row
            v-for="child in unifiedChildren"
            :key="child"
            :title="unifiedChildLabel(child)"
            :description="
              siteMode.unifiedFeedSource === 'following' && !modeSupportsFollowing(child)
                ? 'Not used in Following'
                : undefined
            "
            switch
          >
            <v-switch
              :model-value="siteMode.unifiedSites[child]"
              :disabled="
                siteMode.unifiedFeedSource === 'following' &&
                !modeSupportsFollowing(child)
              "
              color="accent"
              hide-details
              density="compact"
              @update:model-value="siteMode.setUnifiedChild(child, !!$event)"
            />
          </settings-row>
        </settings-group>

        <settings-group title="Accounts" anchor="accounts">
          <settings-row stack>
          <v-expansion-panels v-model="openAccounts" variant="accordion" class="account-panels">
            <v-expansion-panel v-for="site in keySites" :key="site.mode" :value="site.mode">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>{{ site.label }}</div>
                    <div class="text-caption text-medium-emphasis">{{ keySiteStatus(site) }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="keySiteConnected(site) ? 'success' : undefined"
                    :variant="keySiteConnected(site) ? 'tonal' : 'outlined'"
                  >
                    {{ keySiteConnected(site) ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  v-if="site.showUsername"
                  variant="filled"
                  :label="`${site.label} username`"
                  type="text"
                  v-model="fields[site.mode].username"
                  autocomplete="username"
                />
                <v-text-field
                  variant="filled"
                  :append-icon="showSecret[site.mode] ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret[site.mode] ? 'text' : 'password'"
                  :label="`${site.label} API key`"
                  v-model="fields[site.mode].apiKey"
                  @click:append="showSecret[site.mode] = !showSecret[site.mode]"
                  autocomplete="password"
                  :counter="site.showUsername ? 24 : undefined"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    How to get an API key
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    <template v-if="site.mode === 'furbooru'">
                      Go to <external-link href="https://furbooru.org/registration/edit" /> > API Key to generate your key.
                      No username is required — the key identifies your account automatically.
                    </template>
                    <template v-else>
                      Go to <external-link :href="`${fields[site.mode].baseUrl}users/home`" /> > Manage API Access to get the API key
                    </template>
                  </p>
                </details>
                <v-select
                  v-if="site.apiItems"
                  variant="filled"
                  :label="`${site.label} API`"
                  v-model="fields[site.mode].baseUrl"
                  :items="site.apiItems"
                />
                <v-text-field
                  v-if="site.apiItems"
                  variant="filled"
                  :label="`Custom ${site.label} URL`"
                  type="text"
                  v-model="fields[site.mode].baseUrl"
                  autocomplete="url"
                  hint="You might want to change your username/API key if you switch instances"
                  persistent-hint
                />
                <div>
                  <v-btn
                    :disabled="site.showUsername ? (!fields[site.mode].username || !fields[site.mode].apiKey) : !fields[site.mode].apiKey"
                    :loading="verification[site.mode].loading"
                    :color="verification[site.mode].success ? 'success' : verification[site.mode].message ? 'error' : 'accent'"
                    variant="text"
                    @click="verifyKeySite(site.mode)"
                  >
                    Verify credentials
                  </v-btn>
                  <p v-if="verification[site.mode].message">
                    {{ verification[site.mode].message }}
                  </p>
                  <details
                    v-if="!verification[site.mode].success && verification[site.mode].message"
                    class="text-left mt-1"
                  >
                    <summary class="text-caption text-medium-emphasis account-help-summary">
                      Troubleshooting
                    </summary>
                    <p class="text-left text-caption mt-1 mb-0">
                      A network error means that <i>something</i> did not work.
                      Most likely, this was an authentication error.
                      <template v-if="site.mode === 'furbooru'">
                        Make sure you copied the Furbooru API key from
                        <external-link href="https://furbooru.org/registration/edit" /> correctly.
                      </template>
                      <template v-else>
                        Double check if the username is exactly the same as on
                        <external-link :href="`${fields[site.mode].baseUrl}users/home`" /> and make sure you copied the API key correctly - it
                        should be 24 characters long.
                        <br />
                        Due to a security policy (CORS), m-e621 cannot determine the cause of the error. There might be a
                        general error with the network or {{ site.label }}.
                      </template>
                    </p>
                  </details>
                </div>
                <v-btn
                  class="mt-4"
                  :disabled="site.showUsername ? !fields[site.mode].username : !fields[site.mode].apiKey"
                  color="accent"
                  variant="text"
                  @click="toggleKeySiteFavs(site)"
                >
                  {{ keySiteFavsExists(site) ? `Remove "${site.favsName}" saved search` : `Add "${site.favsName}" saved search` }}
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="inkbunny">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>Inkbunny</div>
                    <div class="text-caption text-medium-emphasis">{{ inkbunnyStatus }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="inkbunnyLoggedIn ? 'success' : undefined"
                    :variant="inkbunnyLoggedIn ? 'tonal' : 'outlined'"
                  >
                    {{ inkbunnyLoggedIn ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  variant="filled"
                  label="Inkbunny username"
                  type="text"
                  v-model="fields.inkbunny.username"
                  autocomplete="username"
                  :disabled="inkbunnyLoggedIn"
                />
                <v-text-field
                  v-if="!inkbunnyLoggedIn"
                  variant="filled"
                  :append-icon="showSecret.inkbunny ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret.inkbunny ? 'text' : 'password'"
                  label="Inkbunny password"
                  v-model="inkbunnyPassword"
                  @click:append="showSecret.inkbunny = !showSecret.inkbunny"
                  autocomplete="current-password"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    Login help
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    Enable API Access at <external-link href="https://inkbunny.net/account.php" />.
                    If you set an Allowed IP Range, the server IP must be included
                    (<external-link href="https://inkbunny.net/iprange.php" />).
                    The password is used only to log in and is not saved.
                  </p>
                </details>
                <div>
                  <v-btn
                    v-if="!inkbunnyLoggedIn"
                    :disabled="!fields.inkbunny.username || !inkbunnyPassword"
                    :loading="inkbunnyAuth.loading"
                    :color="inkbunnyAuth.success ? 'success' : inkbunnyAuth.message ? 'error' : 'accent'"
                    variant="text"
                    @click="loginInkbunny"
                  >
                    Log in
                  </v-btn>
                  <v-btn
                    v-else
                    :loading="inkbunnyAuth.loading"
                    color="accent"
                    variant="text"
                    @click="logoutInkbunny"
                  >
                    Log out
                  </v-btn>
                  <p v-if="inkbunnyAuth.message">{{ inkbunnyAuth.message }}</p>
                </div>
                <v-btn
                  class="mt-4"
                  :disabled="!inkbunnyLoggedIn"
                  color="accent"
                  variant="text"
                  @click="toggleInkbunnyFollowingSearch"
                >
                  {{ inkbunnyFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!inkbunnyLoggedIn"
                  color="accent"
                  variant="text"
                  @click="toggleInkbunnyUnreadSearch"
                >
                  {{ inkbunnyUnreadExists ? `Remove "Unread" saved search` : `Add "Unread" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!inkbunnyLoggedIn"
                  color="accent"
                  variant="text"
                  @click="toggleInkbunnyFavsSearch"
                >
                  {{ inkbunnyFavsExists ? `Remove "My Favs" saved search` : `Add "My Favs" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!inkbunnyLoggedIn"
                  :loading="inkbunnyWatchlistLoading"
                  color="accent"
                  variant="text"
                  @click="addWatchlistSearches"
                >
                  Add watchlist artists as saved searches
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="furaffinity">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>FurAffinity</div>
                    <div class="text-caption text-medium-emphasis">{{ faStatus }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="faLoggedIn ? 'success' : undefined"
                    :variant="faLoggedIn ? 'tonal' : 'outlined'"
                  >
                    {{ faLoggedIn ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  variant="filled"
                  label="FurAffinity username"
                  type="text"
                  v-model="fields.furaffinity.username"
                  autocomplete="username"
                  :disabled="faLoggedIn"
                />
                <v-text-field
                  v-if="!faLoggedIn"
                  variant="filled"
                  :append-icon="showSecret.furaffinity ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret.furaffinity ? 'text' : 'password'"
                  label="FurAffinity password"
                  v-model="faPassword"
                  @click:append="showSecret.furaffinity = !showSecret.furaffinity"
                  autocomplete="current-password"
                />
                <v-text-field
                  v-if="!faLoggedIn"
                  variant="filled"
                  :append-icon="showFaCookies ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showFaCookies ? 'text' : 'password'"
                  label="FA_COOKIE_A"
                  v-model="faCookieA"
                  @click:append="showFaCookies = !showFaCookies"
                  autocomplete="off"
                />
                <v-text-field
                  v-if="!faLoggedIn"
                  variant="filled"
                  :append-icon="showFaCookies ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showFaCookies ? 'text' : 'password'"
                  label="FA_COOKIE_B"
                  v-model="faCookieB"
                  @click:append="showFaCookies = !showFaCookies"
                  autocomplete="off"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    Cookie / login help
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    Paste <code>a</code>/<code>b</code> cookies here to sign in — they are stored in
                    settings and included in Backup JSON.
                    <strong>Precedence:</strong> profile cookies override host
                    <code>FA_COOKIE_A</code>/<code>FA_COOKIE_B</code>; if the profile has none,
                    the host env is used; otherwise guest/SFW. Password login is a fallback; the
                    password is not saved. Do not log out of the FurAffinity session those cookies
                    belong to. Open
                    <external-link href="https://www.furaffinity.net/login/">
                      FurAffinity login
                    </external-link>
                    if you need to sign in first.
                  </p>
                  <p class="text-left text-caption mt-2 mb-0">
                    <strong>Chrome / Chromium:</strong>
                    log in on furaffinity.net → F12 → Application → Cookies →
                    <code>https://www.furaffinity.net</code> → copy the Values for
                    <code>a</code> and <code>b</code> into the fields above (or host env).
                  </p>
                  <p class="text-left text-caption mt-2 mb-0">
                    <strong>Firefox:</strong>
                    log in on furaffinity.net → F12 → Storage → Cookies →
                    <code>https://www.furaffinity.net</code> → copy the Values for
                    <code>a</code> and <code>b</code> the same way.
                  </p>
                </details>
                <div>
                  <v-btn
                    v-if="!faLoggedIn"
                    :disabled="!canFaPasswordLogin && !canFaCookieLogin"
                    :loading="faAuth.loading"
                    :color="faAuth.success ? 'success' : faAuth.message ? 'error' : 'accent'"
                    variant="text"
                    @click="canFaCookieLogin ? loginFurAffinityCookies() : loginFurAffinity()"
                  >
                    {{ canFaCookieLogin ? "Log in with cookies" : "Log in" }}
                  </v-btn>
                  <v-btn
                    v-else
                    :loading="faAuth.loading"
                    color="accent"
                    variant="text"
                    @click="logoutFurAffinity"
                  >
                    Log out
                  </v-btn>
                  <v-btn
                    v-if="!faLoggedIn && faNeedsBrowserLogin"
                    color="accent"
                    variant="text"
                    @click="openFaLoginPage"
                  >
                    Open FurAffinity login
                  </v-btn>
                  <p v-if="faAuth.message">{{ faAuth.message }}</p>
                </div>
                <v-btn
                  class="mt-4"
                  :disabled="!faLoggedIn"
                  color="accent"
                  variant="text"
                  @click="toggleFaFollowingSearch"
                >
                  {{ faFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!faLoggedIn && !fields.furaffinity.username"
                  color="accent"
                  variant="text"
                  @click="toggleFaFavsSearch"
                >
                  {{ faFavsExists ? `Remove "My Favs" saved search` : `Add "My Favs" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!faLoggedIn"
                  :loading="faWatchlistLoading"
                  color="accent"
                  variant="text"
                  @click="addFaWatchlistSearches"
                >
                  Add watchlist artists as saved searches
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="weasyl">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>Weasyl</div>
                    <div class="text-caption text-medium-emphasis">{{ weasylStatus }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="weasylConnected ? 'success' : undefined"
                    :variant="weasylConnected ? 'tonal' : 'outlined'"
                  >
                    {{ weasylConnected ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  variant="filled"
                  label="Weasyl username"
                  type="text"
                  v-model="fields.weasyl.username"
                  autocomplete="username"
                />
                <v-text-field
                  variant="filled"
                  :append-icon="showSecret.weasyl ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret.weasyl ? 'text' : 'password'"
                  label="Weasyl API key"
                  v-model="fields.weasyl.apiKey"
                  @click:append="showSecret.weasyl = !showSecret.weasyl"
                  autocomplete="off"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    How to get an API key
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    Go to <external-link href="https://www.weasyl.com/control/apikeys" /> to generate an API key.
                    Without a key, only SFW/general content is shown. The username is used to browse your favorites.
                  </p>
                </details>
                <div>
                  <v-btn
                    :disabled="!fields.weasyl.apiKey"
                    :loading="weasylAuth.loading"
                    :color="weasylAuth.success ? 'success' : weasylAuth.message ? 'error' : 'accent'"
                    variant="text"
                    @click="verifyWeasyl"
                  >
                    Verify API key
                  </v-btn>
                  <p v-if="weasylAuth.message">{{ weasylAuth.message }}</p>
                </div>
                <v-btn
                  class="mt-4"
                  :disabled="!fields.weasyl.username"
                  color="accent"
                  variant="text"
                  @click="toggleWeasylFavsSearch"
                >
                  {{ weasylFavsExists ? `Remove "My Favs" saved search` : `Add "My Favs" saved search` }}
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="itaku">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>Itaku</div>
                    <div class="text-caption text-medium-emphasis">{{ itakuStatus }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="itakuConnected ? 'success' : undefined"
                    :variant="itakuConnected ? 'tonal' : 'outlined'"
                  >
                    {{ itakuConnected ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  variant="filled"
                  label="Itaku username (from verify)"
                  type="text"
                  v-model="fields.itaku.username"
                  autocomplete="username"
                  readonly
                />
                <v-text-field
                  variant="filled"
                  :append-icon="showSecret.itaku ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret.itaku ? 'text' : 'password'"
                  label="Itaku auth token"
                  v-model="fields.itaku.apiKey"
                  @click:append="showSecret.itaku = !showSecret.itaku"
                  autocomplete="off"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    How to get a token
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    In a logged-in Itaku browser tab, open DevTools → Network → any
                    <code>/api/</code> request → copy the
                    <code>Authorization: Token …</code> value (with or without the
                    <code>Token</code> prefix). Guest browse works without a token;
                    login unlocks stars and following.
                  </p>
                </details>
                <div>
                  <v-btn
                    :disabled="!fields.itaku.apiKey"
                    :loading="itakuAuth.loading"
                    :color="itakuAuth.success ? 'success' : itakuAuth.message ? 'error' : 'accent'"
                    variant="text"
                    @click="verifyItaku"
                  >
                    Verify token
                  </v-btn>
                  <p v-if="itakuAuth.message">{{ itakuAuth.message }}</p>
                </div>
                <v-btn
                  class="mt-4"
                  :disabled="!fields.itaku.apiKey"
                  color="accent"
                  variant="text"
                  @click="toggleItakuStarsSearch"
                >
                  {{ itakuStarsExists ? `Remove "My Stars" saved search` : `Add "My Stars" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!fields.itaku.apiKey"
                  color="accent"
                  variant="text"
                  @click="toggleItakuFollowingSearch"
                >
                  {{ itakuFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="sofurry">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>SoFurry</div>
                    <div class="text-caption text-medium-emphasis">{{ sofurryStatus }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="sofurryLoggedIn ? 'success' : undefined"
                    :variant="sofurryLoggedIn ? 'tonal' : 'outlined'"
                  >
                    {{ sofurryLoggedIn ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  variant="filled"
                  label="SoFurry email"
                  type="email"
                  v-model="sofurryEmail"
                  autocomplete="email"
                  :disabled="sofurryLoggedIn"
                />
                <v-text-field
                  variant="filled"
                  label="SoFurry username (from login)"
                  type="text"
                  v-model="fields.sofurry.username"
                  autocomplete="username"
                  :disabled="sofurryLoggedIn"
                />
                <v-text-field
                  v-if="!sofurryLoggedIn"
                  variant="filled"
                  :append-icon="showSecret.sofurry ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret.sofurry ? 'text' : 'password'"
                  label="SoFurry password"
                  v-model="sofurryPassword"
                  @click:append="showSecret.sofurry = !showSecret.sofurry"
                  autocomplete="current-password"
                />
                <v-text-field
                  v-if="!sofurryLoggedIn"
                  variant="filled"
                  :append-icon="showSofurryCookies ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSofurryCookies ? 'text' : 'password'"
                  label="Session cookies"
                  v-model="sofurryCookiePaste"
                  @click:append="showSofurryCookies = !showSofurryCookies"
                  autocomplete="off"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    Cookie / login help
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    Sign in with email/password, or paste SoFurry cookies from DevTools.
                    Prefer the Remix <code>_session</code> value (or both
                    <code>_session</code> and <code>sofurry_session</code>). A bare cookie
                    value is fine — m-e621 will name it. Cookies are stored in settings and
                    Backup JSON; the password is not saved.
                  </p>
                  <p class="text-left text-caption mt-2 mb-0">
                    <strong>Chrome / Firefox:</strong>
                    log in on
                    <external-link href="https://sofurry.com/">sofurry.com</external-link>
                    → F12 → Application/Storage → Cookies →
                    <code>https://sofurry.com</code> → copy <code>_session</code>
                    (and <code>sofurry_session</code> if present).
                  </p>
                </details>
                <div>
                  <v-btn
                    v-if="!sofurryLoggedIn"
                    :disabled="!canSofurryPasswordLogin && !canSofurryCookieLogin"
                    :loading="sofurryAuth.loading"
                    :color="sofurryAuth.success ? 'success' : sofurryAuth.message ? 'error' : 'accent'"
                    variant="text"
                    @click="canSofurryCookieLogin ? loginSofurryCookies() : loginSofurry()"
                  >
                    {{ canSofurryCookieLogin ? "Log in with cookies" : "Log in" }}
                  </v-btn>
                  <v-btn
                    v-else
                    :loading="sofurryAuth.loading"
                    color="accent"
                    variant="text"
                    @click="logoutSofurry"
                  >
                    Log out
                  </v-btn>
                  <p v-if="sofurryAuth.message">{{ sofurryAuth.message }}</p>
                </div>
                <v-btn
                  class="mt-2"
                  :disabled="!sofurryLoggedIn"
                  color="accent"
                  variant="text"
                  @click="toggleSofurryLikesSearch"
                >
                  {{ sofurryLikesExists ? `Remove "My Likes" saved search` : `Add "My Likes" saved search` }}
                </v-btn>
                <v-btn
                  class="mt-2"
                  :disabled="!sofurryLoggedIn"
                  color="accent"
                  variant="text"
                  @click="toggleSofurryFollowingSearch"
                >
                  {{ sofurryFollowingExists ? `Remove "Following" saved search` : `Add "Following" saved search` }}
                </v-btn>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel value="tailspace">
              <v-expansion-panel-title>
                <div class="d-flex align-center fill-width pr-2">
                  <div class="text-left flex-grow-1">
                    <div>Tailspace</div>
                    <div class="text-caption text-medium-emphasis">{{ tsStatus }}</div>
                  </div>
                  <v-chip
                    size="x-small"
                    label
                    :color="tsLoggedIn ? 'success' : undefined"
                    :variant="tsLoggedIn ? 'tonal' : 'outlined'"
                  >
                    {{ tsLoggedIn ? "Auth saved" : "No credentials" }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field
                  variant="filled"
                  label="Tailspace username"
                  type="text"
                  v-model="fields.tailspace.username"
                  autocomplete="username"
                  :disabled="tsLoggedIn"
                />
                <v-text-field
                  v-if="!tsLoggedIn"
                  variant="filled"
                  :append-icon="showSecret.tailspace ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showSecret.tailspace ? 'text' : 'password'"
                  label="Tailspace password"
                  v-model="tsPassword"
                  @click:append="showSecret.tailspace = !showSecret.tailspace"
                  autocomplete="current-password"
                />
                <v-text-field
                  v-if="!tsLoggedIn"
                  variant="filled"
                  :append-icon="showTsCookie ? 'mdi-eye-off' : 'mdi-eye'"
                  :type="showTsCookie ? 'text' : 'password'"
                  label="tailspace_session cookie"
                  v-model="tsCookie"
                  @click:append="showTsCookie = !showTsCookie"
                  autocomplete="off"
                />
                <details class="text-left mb-2">
                  <summary class="text-caption text-medium-emphasis account-help-summary">
                    Cookie / login help
                  </summary>
                  <p class="text-left text-caption mt-1 mb-0">
                    Paste the <code>tailspace_session</code> cookie value (or
                    <code>tailspace_session=…</code>) to sign in — it is stored in settings and
                    included in Backup JSON. Password login is a fallback; the password is not
                    saved. Do not log out of the Tailspace session that cookie belongs to.
                  </p>
                  <p class="text-left text-caption mt-2 mb-0">
                    <strong>Chrome / Firefox:</strong>
                    log in on
                    <external-link href="https://tailspace.com/login">tailspace.com</external-link>
                    → F12 → Application/Storage → Cookies →
                    <code>https://tailspace.com</code> → copy the Value for
                    <code>tailspace_session</code>.
                  </p>
                </details>
                <div>
                  <v-btn
                    v-if="!tsLoggedIn"
                    :disabled="!canTsPasswordLogin && !canTsCookieLogin"
                    :loading="tsAuth.loading"
                    :color="tsAuth.success ? 'success' : tsAuth.message ? 'error' : 'accent'"
                    variant="text"
                    @click="canTsCookieLogin ? loginTailspaceCookies() : loginTailspace()"
                  >
                    {{ canTsCookieLogin ? "Log in with cookie" : "Log in" }}
                  </v-btn>
                  <v-btn
                    v-else
                    :loading="tsAuth.loading"
                    color="accent"
                    variant="text"
                    @click="logoutTailspace"
                  >
                    Log out
                  </v-btn>
                  <p v-if="tsAuth.message">{{ tsAuth.message }}</p>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          </settings-row>
        </settings-group>

        <settings-group
          title="Favorites proxy"
          description="Favorites are proxied through this app's /api/ so they work on this host."
          anchor="proxy"
        >
          <settings-row stack>
            <v-text-field
              variant="filled"
              label="Favorites API"
              type="text"
              v-model="proxyUrl"
              autocomplete="url"
              hide-details="auto"
            />
            <p class="text-left text-caption text-medium-emphasis mt-2 mb-0">
              The old public Vercel proxy only allows the original m-e621 websites, which is why it
              returns “Failed to fetch” here.
            </p>
          </settings-row>
        </settings-group>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import SettingsPageTitle, { type SettingsNavChip } from "./SettingsPageTitle.vue";
import SettingsGroup from "./SettingsGroup.vue";
import SettingsRow from "./SettingsRow.vue";
import ProfileListSync from "./ProfileListSync.vue";
import { computed, reactive, ref, watch } from "vue";
import ExternalLink from "@/App/ExternalLink.vue";
import { useMainStore, useSiteModeStore, useUrlStore } from "@/services";
import { UNIFIED_CHILD_MODES, type SiteMode, type UnifiedFeedSource } from "@/services/types";
import { liveAccount, liveSearches, setLiveAccount, liveBaseUrl, setLiveBaseUrl, profileHasAuthMaterial } from "@/services/siteProfiles";
import {
  addSearchTag,
  searchesHaveTag,
  toggleSearchTag,
} from "@/services/savedSearchNormalize";
import { unifiedChildLabel } from "@/misc/util/postOrigin";
import { modeSupportsFollowing } from "@/misc/util/siteCapabilities";
import { openUrlInNewTab } from "@/misc/util/url";
import { getApiService } from "@/worker/services";
import { useHead } from "@unhead/vue";

const FA_LOGIN_URL = "https://www.furaffinity.net/login/";

useHead({ title: "Account Settings" });

const main = useMainStore();
const url = useUrlStore();
const siteMode = useSiteModeStore();
const unifiedChildren = UNIFIED_CHILD_MODES;
const onUnifiedFeedSource = (value: unknown) => {
  if (value === "search" || value === "following") {
    siteMode.setUnifiedFeedSource(value as UnifiedFeedSource);
  }
};
const activeModeLabel = computed(() => unifiedChildLabel(siteMode.activeMode));
const showSitesMore = ref(false);

const navChips: SettingsNavChip[] = [
  { label: "Sites", anchor: "sites" },
  { label: "Sync", anchor: "sync" },
  { label: "Unified", anchor: "unified" },
  { label: "Accounts", anchor: "accounts" },
  { label: "Proxy", anchor: "proxy" },
];

type KeySiteMode = "e621" | "e6ai" | "furbooru";
type AccountMode = KeySiteMode | "inkbunny" | "furaffinity" | "weasyl" | "itaku" | "sofurry" | "tailspace";

type KeySite = {
  mode: KeySiteMode;
  label: string;
  showUsername: boolean;
  apiItems?: string[];
  favsName: string;
  favsTag: (username: string) => string;
};

const keySites: KeySite[] = [
  {
    mode: "e621",
    label: "e621",
    showUsername: true,
    apiItems: ["https://e621.net/", "https://e926.net/", "https://e6ai.net/"],
    favsName: "Favorites",
    favsTag: (username) => `fav:${username}`,
  },
  {
    mode: "e6ai",
    label: "e6ai",
    showUsername: true,
    apiItems: ["https://e6ai.net/"],
    favsName: "Favorites",
    favsTag: (username) => `fav:${username}`,
  },
  {
    mode: "furbooru",
    label: "Furbooru",
    showUsername: false,
    favsName: "My Faves",
    favsTag: () => "my:faves",
  },
];

const accountFields = (mode: SiteMode) =>
  reactive({
    username: computed({
      get: () => liveAccount(main.$state, mode).username || "",
      set: (value: string) =>
        setLiveAccount(main.$state, mode, { username: value || null }),
    }),
    apiKey: computed({
      get: () => liveAccount(main.$state, mode).apiKey || "",
      set: (value: string) =>
        setLiveAccount(main.$state, mode, { apiKey: value || null }),
    }),
    baseUrl: computed({
      get: () => liveBaseUrl(main.$state, mode),
      set: (value: string) => setLiveBaseUrl(main.$state, mode, value),
    }),
  });

const fields = {
  e621: accountFields("e621"),
  e6ai: accountFields("e6ai"),
  furbooru: accountFields("furbooru"),
  inkbunny: accountFields("inkbunny"),
  furaffinity: accountFields("furaffinity"),
  weasyl: accountFields("weasyl"),
  itaku: accountFields("itaku"),
  sofurry: accountFields("sofurry"),
  tailspace: accountFields("tailspace"),
};

const signedInModes = (): AccountMode[] => {
  const modes: AccountMode[] = ["e621", "e6ai", "furbooru", "inkbunny", "furaffinity", "weasyl", "itaku", "sofurry", "tailspace"];
  return modes.filter((mode) => {
    const account = liveAccount(main.$state, mode);
    return !!(account.username || account.apiKey);
  });
};

const openAccounts = ref<AccountMode | undefined>(signedInModes()[0]);
const showSecret = reactive<Record<AccountMode, boolean>>({
  e621: false,
  e6ai: false,
  furbooru: false,
  inkbunny: false,
  furaffinity: false,
  weasyl: false,
  itaku: false,
  sofurry: false,
  tailspace: false,
});

const proxyUrl = computed<string>({
  get() {
    return url.proxyUrl;
  },
  set(value) {
    url.proxyUrl = value;
  },
});

const emptyAuth = () => ({ success: false, loading: false, message: "" });
const verification = reactive<Record<KeySiteMode, ReturnType<typeof emptyAuth>>>({
  e621: emptyAuth(),
  e6ai: emptyAuth(),
  furbooru: emptyAuth(),
});

const keySiteConnected = (site: KeySite) =>
  profileHasAuthMaterial(site.mode, fields[site.mode]);

const keySiteStatus = (site: KeySite) => {
  const account = fields[site.mode];
  if (!profileHasAuthMaterial(site.mode, account)) return "No credentials saved";
  if (site.mode === "furbooru") return "API key saved";
  return account.username ? `Signed in as ${account.username}` : "Credentials saved";
};

const keySiteFavsTag = (site: KeySite) => site.favsTag(fields[site.mode].username);
const keySiteFavsExists = (site: KeySite) =>
  searchesHaveTag(liveSearches(main.$state, site.mode), keySiteFavsTag(site));
const keySiteFavsLabel = (site: KeySite) =>
  site.mode === "furbooru"
    ? site.favsName
    : `${site.favsName} (${fields[site.mode].username})`;

const toggleKeySiteFavs = (site: KeySite) => {
  const tag = keySiteFavsTag(site);
  if (!tag) return;
  toggleSearchTag(liveSearches(main.$state, site.mode), tag, keySiteFavsLabel(site));
};

const verifyKeySite = async (mode: KeySiteMode) => {
  const site = fields[mode];
  verification[mode].loading = true;
  try {
    const service = await getApiService();
    await service.verifyAccount({
      username: site.username,
      apiKey: site.apiKey,
      baseUrl: site.baseUrl,
      mode,
    });
    verification[mode].success = true;
    verification[mode].message = "Credentials are valid";
  } catch (e: any) {
    console.dir(e);
    verification[mode].success = false;
    verification[mode].message = `Credentials are invalid: ${e.message || e}`;
  } finally {
    verification[mode].loading = false;
  }
};

for (const mode of ["e621", "e6ai", "furbooru"] as const) {
  watch(
    () => [fields[mode].username, fields[mode].apiKey],
    () => {
      verification[mode].message = "";
      verification[mode].success = false;
    },
  );
}

const inkbunnyPassword = ref("");
const inkbunnyWatchlistLoading = ref(false);
const inkbunnyAuth = ref(emptyAuth());
const inkbunnyLoggedIn = computed(
  () =>
    profileHasAuthMaterial("inkbunny", fields.inkbunny) &&
    !!fields.inkbunny.username &&
    fields.inkbunny.username.toLowerCase() !== "guest",
);
const inkbunnyStatus = computed(() =>
  inkbunnyLoggedIn.value
    ? `Signed in as ${fields.inkbunny.username}`
    : "No credentials saved",
);

const INKBUNNY_UNREAD_TAG = "unread:yes";
const INKBUNNY_FOLLOWING_TAG = "following:me";
const INKBUNNY_FAVS_TAG = "favs:me";
const inkbunnyUnreadExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_UNREAD_TAG),
);
const inkbunnyFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FOLLOWING_TAG),
);
const inkbunnyFavsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FAVS_TAG),
);
const toggleInkbunnyUnreadSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_UNREAD_TAG, "Unread");
const toggleInkbunnyFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FOLLOWING_TAG, "Following");
const toggleInkbunnyFavsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FAVS_TAG, "My Favs");

const loginInkbunny = async () => {
  if (!fields.inkbunny.username || !inkbunnyPassword.value) return;
  if (fields.inkbunny.username.toLowerCase() === "guest") {
    inkbunnyAuth.value.success = false;
    inkbunnyAuth.value.message = "Use a member account. Guest browsing needs no login.";
    return;
  }
  inkbunnyAuth.value.loading = true;
  inkbunnyAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginInkbunny({
      username: fields.inkbunny.username,
      password: inkbunnyPassword.value,
    });
    setLiveAccount(main.$state, "inkbunny", {
      username: result.username,
      apiKey: result.sid,
      userId: result.userId,
    });
    inkbunnyPassword.value = "";
    addSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FOLLOWING_TAG, "Following");
    addSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_UNREAD_TAG, "Unread");
    addSearchTag(liveSearches(main.$state, "inkbunny"), INKBUNNY_FAVS_TAG, "My Favs");
    inkbunnyAuth.value.success = true;
    inkbunnyAuth.value.message = `Logged in as ${result.username}`;
  } catch (e: any) {
    inkbunnyAuth.value.success = false;
    inkbunnyAuth.value.message = e?.message || String(e);
  } finally {
    inkbunnyAuth.value.loading = false;
  }
};

const logoutInkbunny = async () => {
  inkbunnyAuth.value.loading = true;
  try {
    const service = await getApiService();
    if (fields.inkbunny.apiKey) {
      await service.logoutInkbunny({ sid: fields.inkbunny.apiKey });
    }
  } catch {
    // SID may already be dead; still clear local credentials
  } finally {
    setLiveAccount(main.$state, "inkbunny", {
      username: null,
      apiKey: null,
      userId: null,
    });
    inkbunnyPassword.value = "";
    inkbunnyAuth.value.loading = false;
    inkbunnyAuth.value.success = false;
    inkbunnyAuth.value.message = "Logged out. Browsing as guest.";
  }
};

const addWatchlistSearches = async () => {
  if (!fields.inkbunny.apiKey) return;
  inkbunnyWatchlistLoading.value = true;
  try {
    const service = await getApiService();
    const watches = await service.getInkbunnyWatchlist({ sid: fields.inkbunny.apiKey });
    let added = 0;
    for (const watch of watches) {
      if (addSearchTag(liveSearches(main.$state, "inkbunny"), `user:${watch.username}`, watch.username)) {
        added += 1;
      }
    }
    inkbunnyAuth.value.message =
      added > 0
        ? `Added ${added} watchlist artist search${added === 1 ? "" : "es"}`
        : "No new watchlist artists to add";
  } catch (e: any) {
    inkbunnyAuth.value.message = e?.message || String(e);
  } finally {
    inkbunnyWatchlistLoading.value = false;
  }
};

watch(inkbunnyPassword, () => {
  inkbunnyAuth.value.message = "";
  inkbunnyAuth.value.success = false;
});

const faPassword = ref("");
const faCookieA = ref("");
const faCookieB = ref("");
const showFaCookies = ref(false);
const faWatchlistLoading = ref(false);
const faAuth = ref(emptyAuth());
const faLoggedIn = computed(
  () => profileHasAuthMaterial("furaffinity", fields.furaffinity),
);
const canFaPasswordLogin = computed(
  () => !!(fields.furaffinity.username && faPassword.value),
);
const canFaCookieLogin = computed(() => !!(faCookieA.value.trim() && faCookieB.value.trim()));
const faNeedsBrowserLogin = computed(() => {
  const msg = (faAuth.value.message || "").toLowerCase();
  return msg.includes("captcha") || msg.includes("challenge");
});
const openFaLoginPage = () => openUrlInNewTab(FA_LOGIN_URL);
const faStatus = computed(() =>
  faLoggedIn.value
    ? fields.furaffinity.username
      ? `Signed in as ${fields.furaffinity.username}`
      : "Cookies saved (profile)"
    : "No credentials saved (host FA_COOKIE_* not shown)",
);
const FA_FAVS_TAG = "favs:me";
const FA_FOLLOWING_TAG = "following:me";
const faFavsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "furaffinity"), FA_FAVS_TAG),
);
const faFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "furaffinity"), FA_FOLLOWING_TAG),
);
const toggleFaFavsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "furaffinity"), FA_FAVS_TAG, "My Favs");
const toggleFaFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "furaffinity"), FA_FOLLOWING_TAG, "Following");

const applyFaLoginResult = (result: {
  username: string;
  cookies: string;
  cookieSource?: string;
}) => {
  setLiveAccount(main.$state, "furaffinity", {
    username: result.username,
    apiKey: result.cookies,
  });
  fields.furaffinity.username = result.username;
  faPassword.value = "";
  faCookieA.value = "";
  faCookieB.value = "";
  addSearchTag(liveSearches(main.$state, "furaffinity"), FA_FOLLOWING_TAG, "Following");
  addSearchTag(liveSearches(main.$state, "furaffinity"), FA_FAVS_TAG, "My Favs");
  faAuth.value.success = true;
  const sourceHint =
    result.cookieSource === "profile"
      ? " (using profile cookies)"
      : result.cookieSource === "env"
        ? " (using host FA_COOKIE_*)"
        : result.cookieSource === "guest"
          ? " (guest)"
          : "";
  faAuth.value.message = `Logged in as ${result.username}${sourceHint}`;
};

const loginFurAffinity = async () => {
  if (!canFaPasswordLogin.value) return;
  faAuth.value.loading = true;
  faAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginFurAffinity({
      username: fields.furaffinity.username,
      password: faPassword.value,
    });
    applyFaLoginResult(result);
  } catch (e: any) {
    faAuth.value.success = false;
    faAuth.value.message = e?.message || String(e);
  } finally {
    faAuth.value.loading = false;
  }
};

const loginFurAffinityCookies = async () => {
  if (!canFaCookieLogin.value) return;
  faAuth.value.loading = true;
  faAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginFurAffinityCookies({
      cookieA: faCookieA.value,
      cookieB: faCookieB.value,
    });
    applyFaLoginResult(result);
  } catch (e: any) {
    faAuth.value.success = false;
    faAuth.value.message = e?.message || String(e);
  } finally {
    faAuth.value.loading = false;
  }
};

const logoutFurAffinity = async () => {
  faAuth.value.loading = true;
  try {
    const service = await getApiService();
    await service.logoutFurAffinity();
  } catch {
    // cookies may already be dead
  } finally {
    setLiveAccount(main.$state, "furaffinity", {
      username: null,
      apiKey: null,
    });
    faPassword.value = "";
    faCookieA.value = "";
    faCookieB.value = "";
    faAuth.value.loading = false;
    faAuth.value.success = false;
    faAuth.value.message = "Logged out. Host FA_COOKIE_A/B still apply if set.";
  }
};

// Weasyl auth
const weasylAuth = ref(emptyAuth());
const weasylConnected = computed(() =>
  profileHasAuthMaterial("weasyl", fields.weasyl),
);
const weasylStatus = computed(() =>
  weasylConnected.value
    ? fields.weasyl.username
      ? `Signed in as ${fields.weasyl.username}`
      : "API key saved"
    : "No credentials saved",
);
const WEASYL_FAVS_TAG = "favs:me";
const weasylFavsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "weasyl"), WEASYL_FAVS_TAG),
);
const toggleWeasylFavsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "weasyl"), WEASYL_FAVS_TAG, "My Favs");

const verifyWeasyl = async () => {
  if (!fields.weasyl.apiKey) return;
  weasylAuth.value.loading = true;
  weasylAuth.value.message = "";
  try {
    const service = await getApiService();
    await service.verifyAccount({
      username: fields.weasyl.username || "",
      apiKey: fields.weasyl.apiKey,
      baseUrl: "https://www.weasyl.com/",
      mode: "weasyl",
    });
    weasylAuth.value.success = true;
    weasylAuth.value.message = "API key is valid";
  } catch (e: any) {
    weasylAuth.value.success = false;
    weasylAuth.value.message = e?.message || String(e);
  } finally {
    weasylAuth.value.loading = false;
  }
};

watch(
  () => [fields.weasyl.username, fields.weasyl.apiKey],
  () => {
    weasylAuth.value.message = "";
    weasylAuth.value.success = false;
  },
);

// Itaku auth
const itakuAuth = ref(emptyAuth());
const itakuConnected = computed(() =>
  profileHasAuthMaterial("itaku", fields.itaku),
);
const itakuStatus = computed(() =>
  itakuConnected.value
    ? fields.itaku.username
      ? `Signed in as ${fields.itaku.username}`
      : "Token saved"
    : "No credentials saved",
);
const ITAKU_STARS_TAG = "stars:me";
const ITAKU_FOLLOWING_TAG = "following:me";
const itakuStarsExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "itaku"), ITAKU_STARS_TAG),
);
const itakuFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "itaku"), ITAKU_FOLLOWING_TAG),
);
const toggleItakuStarsSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "itaku"), ITAKU_STARS_TAG, "My Stars");
const toggleItakuFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "itaku"), ITAKU_FOLLOWING_TAG, "Following");

const verifyItaku = async () => {
  if (!fields.itaku.apiKey) return;
  itakuAuth.value.loading = true;
  itakuAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.verifyAccount({
      username: fields.itaku.username || "",
      apiKey: fields.itaku.apiKey,
      baseUrl: "https://itaku.ee/",
      mode: "itaku",
    });
    if (result && typeof result === "object") {
      setLiveAccount(main.$state, "itaku", {
        username: result.username,
        apiKey: fields.itaku.apiKey,
        userId: result.userId,
      });
      fields.itaku.username = result.username;
      itakuAuth.value.message = `Signed in as ${result.username}`;
    } else {
      itakuAuth.value.message = "Token is valid";
    }
    itakuAuth.value.success = true;
  } catch (e: any) {
    itakuAuth.value.success = false;
    itakuAuth.value.message = e?.message || String(e);
  } finally {
    itakuAuth.value.loading = false;
  }
};

watch(
  () => [fields.itaku.username, fields.itaku.apiKey],
  () => {
    itakuAuth.value.message = "";
    itakuAuth.value.success = false;
  },
);

const SOFURRY_LIKES_TAG = "favs:me";
const SOFURRY_FOLLOWING_TAG = "following:me";
const sofurryEmail = ref(fields.sofurry.username || "");
const sofurryPassword = ref("");
const sofurryCookiePaste = ref("");
const showSofurryCookies = ref(false);
const sofurryAuth = ref(emptyAuth());
const sofurryLoggedIn = computed(() =>
  profileHasAuthMaterial("sofurry", fields.sofurry),
);
const canSofurryPasswordLogin = computed(
  () => !!(sofurryEmail.value.trim() && sofurryPassword.value),
);
const canSofurryCookieLogin = computed(() => !!sofurryCookiePaste.value.trim());
const sofurryStatus = computed(() =>
  sofurryLoggedIn.value
    ? fields.sofurry.username
      ? `Signed in as ${fields.sofurry.username}`
      : "Session cookies saved"
    : "No credentials saved",
);
const sofurryLikesExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "sofurry"), SOFURRY_LIKES_TAG),
);
const sofurryFollowingExists = computed(() =>
  searchesHaveTag(liveSearches(main.$state, "sofurry"), SOFURRY_FOLLOWING_TAG),
);
const toggleSofurryLikesSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_LIKES_TAG, "My Likes");
const toggleSofurryFollowingSearch = () =>
  toggleSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_FOLLOWING_TAG, "Following");

const applySofurryLoginResult = (result: {
  username?: string;
  cookies?: string;
}) => {
  const username = result.username;
  const cookies = result.cookies || "";
  if (!username || !cookies) {
    sofurryAuth.value.success = false;
    sofurryAuth.value.message = "Login did not return a Soft username/session";
    return;
  }
  setLiveAccount(main.$state, "sofurry", {
    username,
    apiKey: cookies,
    userId: null,
  });
  fields.sofurry.username = username;
  sofurryPassword.value = "";
  sofurryCookiePaste.value = "";
  addSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_FOLLOWING_TAG, "Following");
  addSearchTag(liveSearches(main.$state, "sofurry"), SOFURRY_LIKES_TAG, "My Likes");
  sofurryAuth.value.success = true;
  sofurryAuth.value.message = `Logged in as ${username}`;
};

const loginSofurry = async () => {
  if (!canSofurryPasswordLogin.value) return;
  sofurryAuth.value.loading = true;
  sofurryAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginSofurry({
      email: sofurryEmail.value.trim(),
      password: sofurryPassword.value,
    });
    if (!result.ok || !result.cookies) {
      throw new Error(result.error || "Login failed");
    }
    applySofurryLoginResult(result);
  } catch (e: any) {
    sofurryAuth.value.success = false;
    sofurryAuth.value.message = e?.message || String(e);
  } finally {
    sofurryAuth.value.loading = false;
  }
};

const loginSofurryCookies = async () => {
  if (!canSofurryCookieLogin.value) return;
  sofurryAuth.value.loading = true;
  sofurryAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginSofurryCookies({
      cookies: sofurryCookiePaste.value.trim(),
    });
    if (!result.ok || !result.cookies) {
      throw new Error(("error" in result && result.error) || "Cookies rejected");
    }
    applySofurryLoginResult(result);
  } catch (e: any) {
    sofurryAuth.value.success = false;
    sofurryAuth.value.message = e?.message || String(e);
  } finally {
    sofurryAuth.value.loading = false;
  }
};

const logoutSofurry = async () => {
  sofurryAuth.value.loading = true;
  try {
    const service = await getApiService();
    await service.logoutSofurry();
  } catch {
    /* ignore */
  } finally {
    setLiveAccount(main.$state, "sofurry", {
      username: null,
      apiKey: null,
      userId: null,
    });
    sofurryPassword.value = "";
    sofurryCookiePaste.value = "";
    sofurryAuth.value.loading = false;
    sofurryAuth.value.success = false;
    sofurryAuth.value.message = "Logged out";
  }
};

const tsPassword = ref("");
const tsCookie = ref("");
const showTsCookie = ref(false);
const tsAuth = ref(emptyAuth());
const tsLoggedIn = computed(() =>
  profileHasAuthMaterial("tailspace", fields.tailspace),
);
const canTsPasswordLogin = computed(
  () => !!(fields.tailspace.username && tsPassword.value),
);
const canTsCookieLogin = computed(() => !!tsCookie.value.trim());
const tsStatus = computed(() =>
  tsLoggedIn.value
    ? fields.tailspace.username
      ? `Signed in as ${fields.tailspace.username}`
      : "Session cookie saved"
    : "No credentials saved",
);

const applyTsLoginResult = (result: {
  username: string;
  cookies: string;
  userId?: number | null;
}) => {
  setLiveAccount(main.$state, "tailspace", {
    username: result.username,
    apiKey: result.cookies,
    userId: result.userId ?? null,
  });
  fields.tailspace.username = result.username;
  tsPassword.value = "";
  tsCookie.value = "";
  tsAuth.value.success = true;
  tsAuth.value.message = `Logged in as ${result.username}`;
};

const loginTailspace = async () => {
  if (!canTsPasswordLogin.value) return;
  tsAuth.value.loading = true;
  tsAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginTailspace({
      username: fields.tailspace.username,
      password: tsPassword.value,
    });
    applyTsLoginResult(result);
  } catch (e: any) {
    tsAuth.value.success = false;
    tsAuth.value.message = e?.message || String(e);
  } finally {
    tsAuth.value.loading = false;
  }
};

const loginTailspaceCookies = async () => {
  if (!canTsCookieLogin.value) return;
  tsAuth.value.loading = true;
  tsAuth.value.message = "";
  try {
    const service = await getApiService();
    const result = await service.loginTailspaceCookies({
      cookies: tsCookie.value,
    });
    applyTsLoginResult(result);
  } catch (e: any) {
    tsAuth.value.success = false;
    tsAuth.value.message = e?.message || String(e);
  } finally {
    tsAuth.value.loading = false;
  }
};

const logoutTailspace = async () => {
  tsAuth.value.loading = true;
  const cookies = fields.tailspace.apiKey;
  try {
    const service = await getApiService();
    await service.logoutTailspace({ cookies });
  } catch {
    // session may already be dead
  } finally {
    setLiveAccount(main.$state, "tailspace", {
      username: null,
      apiKey: null,
      userId: null,
    });
    tsPassword.value = "";
    tsCookie.value = "";
    tsAuth.value.loading = false;
    tsAuth.value.success = false;
    tsAuth.value.message = "Logged out";
  }
};

const addFaWatchlistSearches = async () => {
  faWatchlistLoading.value = true;
  try {
    const service = await getApiService();
    const watches = await service.getFurAffinityWatchlist({
      cookies: fields.furaffinity.apiKey,
      username: fields.furaffinity.username,
    });
    let added = 0;
    for (const watch of watches) {
      if (addSearchTag(liveSearches(main.$state, "furaffinity"), `artist:${watch.name}`, watch.name)) {
        added += 1;
      }
    }
    faAuth.value.message =
      added > 0
        ? `Added ${added} watchlist artist search${added === 1 ? "" : "es"}`
        : "No new watchlist artists to add";
  } catch (e: any) {
    faAuth.value.message = e?.message || String(e);
  } finally {
    faWatchlistLoading.value = false;
  }
};

watch(faPassword, () => {
  faAuth.value.message = "";
  faAuth.value.success = false;
});
</script>

<style scoped>
.account-panels {
  width: 100%;
}
.account-panels :deep(.v-expansion-panel) {
  background: transparent;
}
.account-help-summary {
  cursor: pointer;
  user-select: none;
}
.fill-width {
  width: 100%;
}
</style>
