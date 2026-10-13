# ApplyTrack — Job Application Tracker

**Track your job search. Stay organized. Move closer to your next opportunity.**

ApplyTrack is a full-stack MERN application designed to help job seekers organize job applications, monitor application progress, manage deadlines, and gain insights into their job search through an analytics dashboard.

🌐 **Live Demo:** [Open ApplyTrack](https://applytrack-nine-eta.vercel.app)

🚀 **Backend API:** [ApplyTrack API](https://applytrack-3tom.onrender.com)

📂 **Source Code:** [GitHub Repository](https://github.com/MrRohit2506/applytrack)

---

## ✨ Features

### 🔐 Authentication and Security
- User registration and login.
- Cookie-based session authentication.
- Protected application routes and API endpoints.
- CSRF protection and request-origin validation.
- User-specific data access to help prevent unauthorized access to another user's applications.
- Environment-based configuration for sensitive credentials.

### 📋 Job Application Management
- Create, view, update, and delete job applications.
- Track applications through the following statuses:
  - Applied
  - Interview
  - Offer
  - Rejected
  - Withdrawn
- Search and filter application records.
- Sort applications and navigate paginated results.
- Keep job search information organized in one place.

### 📊 Analytics Dashboard
- Visualize job application activity and progress.
- Review application status distribution.
- Gain a clearer overview of your job search.

### 📁 CSV Import and Export
- Import application data from CSV files.
- Export application records for backup or external analysis.
- Simplify application data management.

### ⏰ Deadline Reminders
- Track important application-related deadlines.
- Keep upcoming tasks visible so important dates are less likely to be missed.

### 📱 Responsive User Interface
- Responsive interface for desktop and mobile screens.
- Client-side navigation and protected pages.
- Error handling for common application and connection issues.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, React Router |
| Styling | Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | Cookie-based authentication, bcrypt |
| API Security | CSRF protection, origin validation, rate limiting |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Version Control | Git, GitHub |

---

## 🏗️ Architecture

```text
                  User / Browser
                        |
                        v
              React + Vite Frontend
                     (Vercel)
                        |
                        v
                /api requests
                        |
                        v
                Express REST API
                    (Render)
                        |
                        v
                 MongoDB Atlas
```

The Vercel frontend forwards API requests to the Render backend. The backend handles authentication, validation, application management, and database operations.

---

## 🚀 Live Application

Try the deployed application:

**[https://applytrack-nine-eta.vercel.app](https://applytrack-nine-eta.vercel.app)**

The backend health endpoint can also be checked here:

**[API Health Check](https://applytrack-3tom.onrender.com/api/health)**

The Render free service may take some time to respond after a period of inactivity.

---

## 💻 Run Locally

### Prerequisites

Install the following:

- Node.js 20 or later
- npm
- A MongoDB Atlas database or another compatible MongoDB instance
- Git

### 1. Clone the repository

Replace the placeholder with your actual GitHub repository URL.

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd ApplyTrack
```

### 2. Install dependencies

If the project root provides the `install:all` script, run:

```bash
npm run install:all
```

Otherwise, install dependencies using the scripts and package managers configured in the root, `client`, and `server` directories.

### 3. Configure environment variables

Create the appropriate environment files based on the project's existing configuration and environment validation.

**Backend environment**

Configure the following variables in the backend environment:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used by the application's authentication implementation |
| `CSRF_SECRET` | Secret used for CSRF token signing; must differ from `JWT_SECRET` |
| `CLIENT_ORIGIN` | Exact frontend origin allowed by the backend |
| `NODE_ENV` | Set to `development` locally and `production` when deployed |

Use the values and additional required variables specified by `server/src/config/env.js` and the project documentation. Production deployments may also use cookie, proxy, session, and rate-limiting settings.

Example frontend origin for local development:

```text
CLIENT_ORIGIN=http://localhost:5173
```

Generate strong, independent secrets for `JWT_SECRET` and `CSRF_SECRET`. Never commit real secrets, database credentials, or production environment files to GitHub.

**Frontend environment**

If required by the existing API client, configure:

```text
VITE_API_BASE_URL=/api
```

The deployed configuration uses a same-origin `/api` proxy. Verify the local development proxy configuration before using this value locally.

### 4. Start the application

Run the frontend and backend using the development scripts defined in their respective `package.json` files. Keep both processes running during local development.

The frontend is typically served by Vite, while the backend runs as an Express server. Check the project's scripts and configuration for the exact commands and ports.

### 5. Verify configuration and tests

Run the checks supported by the root package scripts:

```bash
npm run check:env
npm run verify
npm run audit
```

Use the environment checker with the appropriate local environment configured. Resolve any failures before considering the local setup complete.

---

## 🔒 Security Notes

- Never commit `.env` files, database credentials, or production secrets.
- Use a dedicated MongoDB database user with only the permissions the application requires.
- Restrict MongoDB network access wherever possible.
- Keep CSRF protection and request-origin validation enabled.
- Use HTTPS and secure cookie settings in production.
- Keep frontend public environment variables free of secrets.
- Do not expose authentication tokens or sensitive server configuration in logs.

---

## 🧪 Testing

The project includes automated checks and security-oriented validation developed during implementation.

For the final published version, run the available test suite, lint checks, and production build in your own environment. Only report checks as passing if they have actually completed successfully.

Useful validation commands, when defined by the project, include:

```bash
npm run verify
npm run audit
```

---

## 📸 Screenshots

<img width="1902" height="918" alt="image" src="https://github.com/user-attachments/assets/ddb5c838-2415-4acb-aff7-3b20254098c0" />
<img width="1896" height="958" alt="image" src="https://github.com/user-attachments/assets/065bd668-2b4c-45f5-8ef3-4fb61be29fe8" />
<img width="637" height="817" alt="image" src="https://github.com/user-attachments/assets/bf92f777-e292-4098-9b12-bf298578f17a" />
<img width="1877" height="945" alt="image" src="https://github.com/user-attachments/assets/14f9a584-7c8a-4381-83b1-bbdea04dfc8a" />

---

## 🔮 Potential Future Improvements

- Email notifications and reminders.
- Password reset and email verification.
- Calendar integration for interviews and deadlines.
- Additional analytics and reporting.
- Automated deployment checks and end-to-end browser testing.

These are potential enhancements, not claims about currently implemented features.

---

## 👨‍💻 Author

**Your Name**

- GitHub: [Your GitHub Profile](https://github.com/MrRohit2506)
- LinkedIn: [Your LinkedIn Profile](https://linkedin.com/in/rohit-singh-iiitm2028)

---

**Built with the MERN stack to make job searching more organized, measurable, and manageable.**
