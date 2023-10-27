//
// After a successful login we are redirected to the UI with our username
// and a JWT token. We need to save these in local storage so Verdaccio
// thinks we are logged in.
//

export type Credentials = {
  username: string;
  uiToken: string;
  npmToken: string;
};

export function saveCredentials(credentials: Credentials) {
  // username and token are required for verdaccio to think we are logged in
  localStorage.setItem("username", credentials.username);
  localStorage.setItem("token", credentials.uiToken);
  localStorage.setItem("npm", credentials.npmToken);
}

export function clearCredentials() {
  localStorage.removeItem("username");
  localStorage.removeItem("token");
  localStorage.removeItem("npm");
}

export function isLoggedIn(): boolean {
  for (const key of ["username", "token", "npm"]) {
    if (!localStorage.getItem(key)) {
      return false;
    }
  }

  return true;
}

export function validateCredentials(credentials: Partial<Credentials>): credentials is Credentials {
  for (const key of ["username", "uiToken", "npmToken"]) {
    if (!credentials[key]) {
      return false;
    }
  }

  return true;
}
