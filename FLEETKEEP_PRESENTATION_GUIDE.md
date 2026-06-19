# FleetKeep — Internship Presentation & Technical Guide
### A Beginner-Friendly Masterclass in React 19, Redux Toolkit, and Vite Module Federation

This document is your preparation handbook for presenting your internship project. It explains all technical facets of **FleetKeep** using simple concepts, clear metaphors, and exact code references from your project directory.

---

## 1. Project Stack & System Architecture

### The Technology Stack
*   **Database:** SQLite3 (Serverless relational database stored as a single file: `backend/garage.db`).
*   **Backend:** Python Flask REST API (Lightweight web framework providing HTTP endpoints).
*   **State Management:** Redux Toolkit (Centralized state ledger enforcing unidirectional data flow).
*   **Micro-Frontend Compiler:** Vite + OriginJS Module Federation Plugin.
*   **Development Server / Bundler:** Vite (Serves assets lazily with Native ESM, enabling sub-millisecond Hot Module Replacement).
*   **Styling:** Vanilla CSS variables and layouts (grid, flexbox, glassmorphic styles).

### Architecture Diagram
```
  ┌──────────────────────────────────────────────────────────┐
  │                   BROWSER / CLIENT TREE                  │
  │                                                          │
  │  [ http://localhost:5173 ] (Host Shell)                  │
  │  ├── AuthGate & LandingPage                              │
  │  └── Redux Global Store (User status, Fleet State)       │
  │           │                                              │
  │           ▼ Dynamic Lazy Import                          │
  │  [ http://localhost:5174 ] (Remote MFE)                 │
  │  └── Dashboard Component (Exposed module)                │
  └──────────────────────────┬───────────────────────────────┘
                             │
                             │ HTTP request (Fetch API) / Proxied via Host
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │                      BACKEND SERVER                      │
  │                                                          │
  │  [ http://127.0.0.1:5000 ] (Flask API)                   │
  │  └── SQLite3 database (garage.db)                        │
  └──────────────────────────────────────────────────────────┘
```

---

## 2. Why Are Three Split Terminals Mandatory?

To run this application, you must have three concurrent command lines open. This is not a development convenience; it is a **system requirement**:

1.  **Terminal 1 (Backend - Port 5000):** Runs Python Flask. It handles database transactions (adding vehicles, user registration, updating odometers). Node/Vite cannot execute Python scripts or SQLite operations directly; only a Python interpreter can.
2.  **Terminal 2 (Remote Garage - Port 5174):** Serves the `remote_garage` code. It compiles and publishes the specific `Dashboard` interface. This terminal generates the Module Federation entry file (`remoteEntry.js`).
3.  **Terminal 3 (Host Shell - Port 5173):** Serves the main gateway. This is what the user loads in the browser. It handles login validation and loads the header/nav container. It fetches modules from Port 5174 in the background.

Since a single network port can only be bound to a single listener process at any given time, each part of this architecture runs on its own isolated server.

---

## 3. How Data Passes Between Frontend and Backend

When running separate terminal servers on different ports, the browser blocks direct communication due to security constraints. Here is the lifecycle of how data travels from your React forms to the SQLite database:

### The Problem: CORS (Cross-Origin Resource Sharing)
If a script loaded from port `5173` (Host) tries to send a request directly to port `5000` (Flask), the browser blocks it by default. This security wall is called the **Same-Origin Policy**.

### The Solution: Vite Local Proxy
To bypass CORS seamlessly, your host configuration in `host_shell/vite.config.js` sets up a **Proxy Rule**:
*   Whenever the host frontend calls a URL starting with `/api` (e.g. `/api/vehicles`), the Vite dev server acts as a middleman.
*   The Vite server takes that request and forwards it to `http://127.0.0.1:5000/api` under the hood.
*   Because server-to-server requests are not restricted by browser CORS, this bridges the network ports cleanly.

### Data-Flow Lifepath: Saving a Vehicle
1.  **Form Input:** The user types `"Honda Activa"` in [Dashboard.jsx](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/src/assets/components/Dashboard.jsx) and clicks **Register**.
2.  **Redux Dispatch:** The component dispatches the async thunk `commitAssetToLedger` from [vehicleSlice.js](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/src/store/vehicleSlice.js).
3.  **HTTP Request:** The thunk initiates a JavaScript `fetch()` request:
    `POST /api/vehicles` with a JSON payload of the vehicle characteristics.
4.  **Local Proxy Forwarding:** The browser sends this request to `http://localhost:5173/api/vehicles`. The Host Shell's Vite proxy intercepts the request and relays it to `http://127.0.0.1:5000/api/vehicles`.
5.  **Flask Action:** In `backend/app.py`, Flask receives the request, extracts the JSON data, runs validation checks, and writes a new row to `garage.db` using an SQL `INSERT` statement.
6.  **Response Return:** Flask returns a response payload `{ "message": "Vehicle logged successfully!" }` with status code `201`.
7.  **Redux Resolution:** The HTTP response travels back through the proxy to the browser. Redux Toolkit interceptor marks the action as `fulfilled` and refreshes the vehicle grid state.

---

## 4. Fundamental Concept Explanations (With Project Examples)

### What is React.js?
React is a declarative JavaScript library for building user interfaces. Instead of manually writing code to manipulate web page elements one by one, you write reusable components that describe how the page should look based on the current data (state).
*   *FleetKeep Example:* The [VehicleCard](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/src/assets/components/Dashboard.jsx) is a single React component template. If you have 5 vehicles in your database, React automatically renders 5 cards, passing each vehicle's data into the template as properties (props).

### What is Micro-Frontend Architecture?
Micro-Frontend is a design approach that splits a large frontend application into smaller, semi-independent web apps that run together. Each team can build, test, and deploy their portion without rebuilding the entire system.
*   *FleetKeep Example:* Our `remote_garage` folder is a micro-app that exposes the `Dashboard`. The `host_shell` folder is a separate app that contains the login form. The host imports the remote dashboard at runtime:
    `const RemoteDashboard = lazy(() => import('remote_garage/Dashboard'));`

### What is Redux?
Redux is a global data store for your application. It acts as a **central ledger**. Instead of passing data up and down through 10 layers of React components (known as "prop drilling"), all shared data is kept in a single store. Components subscribe to only the slices of data they need.
*   *FleetKeep Example:* In [authSlice.js](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/host_shell/src/store/authSlice.js), the currently logged-in user details are stored. Both the login screen (`AuthGate`) and the `Dashboard` fetch user info directly from this slice using `useSelector(selectUser)`.

### How is State Management Done in this Project?
We use **Redux Toolkit (RTK)** to organize the state. 
*   Data is read using **selectors** (e.g. `selectFilteredAssets`).
*   State can only be changed by dispatching **actions**.
*   **Reducers** listen to actions and calculate the new state. We use `createAsyncThunk` to manage asynchronous HTTP calls (fetch, create, delete) with standard states: `pending`, `fulfilled`, and `rejected`.
*   We use **Optimistic UI Updates** in [vehicleSlice.js](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/host_shell/src/store/vehicleSlice.js): when you click "Remove", the vehicle is immediately removed from your screen before the server even answers. If the server fails to delete it, Redux automatically rolls back the state, restoring the card.

### What is COM and DOM?
*   **DOM (Document Object Model):** The HTML structure representation in browser memory. It is a tree structure of nodes (e.g., `<div>`, `<h1>`). When you click a tab or change a form field, the browser updates this DOM tree. Because modifying the real browser DOM directly is slow, React uses a **Virtual DOM** in memory to calculate minimal updates before altering the actual page layout.
*   **COM (Component Object Model):** An unrelated Microsoft platform-standard binary interface from the 1990s used to make desktop programs communicate (like Word interacting with Excel). In web development, we focus entirely on the **DOM**.

### How a Design is Converted into a Web App
1.  **UI Design:** Creators draw mockups (e.g., in Figma) selecting the color scheme, buttons, and layout structures.
2.  **HTML/JSX Structure:** Developers translate visual sections into semantic markup (using `nav`, `section`, `form`, and `div` tags).
3.  **CSS Styling:** Style tokens (like `--primary-blue`, glassmorphism transparency, and grid gaps) are written in CSS stylesheet files.
4.  **State Binding:** React state Hooks bind form input values to input tags.
5.  **Database Integration:** API endpoints are written on the backend, connecting UI actions directly to SQL databases.

---

## 5. Directory & File Breakdown

### Backend Component
*   [app.py](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/backend/app.py): The core Flask backend. Configures SQLite connection tables, executes CORS policies, provides `/api/login` and `/api/vehicles` routing endpoints, and implements plate format verification.
*   [requirements.txt](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/backend/requirements.txt): Lists Python library dependencies (`flask`, `flask-cors`, etc.).

### Remote Garage Component (Port 5174)
*   [package.json](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/package.json): Lists Node.js libraries and compilation scripts for building the remote app.
*   [vite.config.js](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/vite.config.js): Instructs the bundler to compile and expose the `./Dashboard` component under the alias `remote_garage` to the host shell.
*   [src/assets/components/Dashboard.jsx](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/src/assets/components/Dashboard.jsx): The dashboard view containing vehicle forms, card views, service trigger logic, document expiry tracking, and the mileage cost calculator.
*   [src/store/vehicleSlice.js](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/remote_garage/src/store/vehicleSlice.js): Manages Redux state for all vehicle assets. Contains the thunks (`fetchAll`, `commitAsset`, `decommission`) and selectors for vehicle lists.

### Host Shell Component (Port 5173)
*   [vite.config.js](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/host_shell/vite.config.js): Defines the connection manifest endpoint pointing to port 5174 for fetching remote assets and configures the `/api` request proxy to route transactions to port 5000.
*   [src/containers/FleetShell.jsx](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/host_shell/src/containers/FleetShell.jsx): Implements the lazy import mechanism. Imports the dashboard, displays a skeleton loading screen while loading over the network, and uses a React Error Boundary to handle connection failures.
*   [src/App.jsx](file:///c:/Users/Lenovo/OneDrive/Desktop/fleetkeep/host_shell/src/App.jsx): The gateway module that displays the landing page, redirects users to login, and routes authenticated users to the dashboard.

---

## 6. Mock Interview: Presentation Q&A Preparation

Here are the critical questions your mentor or evaluation panel may ask, along with professional answers using FleetKeep as the proof:

### Q1: "Why did you choose Redux Toolkit over simple React Context API for state management?"
> **Answer:** React Context re-renders all consumer components whenever any part of the context state updates (for instance, toggling a simple loading spinner re-renders all vehicle cards). Redux Toolkit resolves this by using selector-gated subscriptions. Components only re-evaluate when their selected data slice changes, optimizing performance. Furthermore, RTK formalizes the asynchronous lifecycle (`pending`/`fulfilled`/`rejected` states) and enables time-travel debugging via Redux DevTools, which makes debugging large-scale fleet applications much easier.

### Q2: "What is Vite Module Federation, and what problem does it solve in this project?"
> **Answer:** Vite Module Federation allows compiled JavaScript chunks to be exposed and consumed by different web applications at runtime. In our project, `remote_garage` exposes the `Dashboard` component, and `host_shell` consumes it. This decouples our application. If the team working on the dashboard updates its features, they can deploy the changes to `remote_garage` independently. The host shell fetches the latest code dynamically without needing a rebuild or redeployment of the shell application.

### Q3: "How does the dual-trigger service alert system work?"
> **Answer:** We implemented service tracking using two criteria: odometer mileage and elapsed calendar months. In `resolveServiceTrigger()`, we calculate the distance remaining to the next odometer milestone, and the days remaining based on the last service date plus the service period in months. We determine the urgency levels for both metrics (from 0 to 3, where 3 represents overdue). Whichever trigger has the higher urgency level wins, and the UI displays this trigger with appropriate styling.

### Q4: "Why does the application require three terminal servers to run?"
> **Answer:** The application runs three separate servers because of a clear separation of concerns. First, Python Flask runs on port 5000 to manage SQL transactions and interact with SQLite3. Second, the remote micro-frontend serves on port 5174 to deliver the compiled Dashboard component. Third, the Host Shell runs on port 5173 to manage authentication and integrate the micro-frontends. Since a port can only bind to a single process, three separate server processes must run concurrently.

### Q5: "How does the host shell communicate with the backend on port 5000 without hitting CORS errors?"
> **Answer:** We configured a proxy rule in the host's `vite.config.js` file. When the client application requests `/api/vehicles`, the Vite server on port 5173 intercepts the request and proxies it to `http://127.0.0.1:5000/api/vehicles` on the backend. This bypasses browser CORS policies, as server-to-server calls do not trigger Same-Origin restrictions.

### Q6: "What is an 'Optimistic Update' in Redux, and how is it used here?"
> **Answer:** An optimistic update updates the client UI immediately before receiving server confirmation. In `vehicleSlice.js` under the `decommissionAsset.pending` reducer, we remove the vehicle from our local state immediately. The card disappears instantly from the user's screen without waiting for the database delete request to complete. If the delete operation succeeds, the state remains. If it fails, the reducer transitions to `rejected` and restores the vehicle in the UI. This creates a responsive user experience.
