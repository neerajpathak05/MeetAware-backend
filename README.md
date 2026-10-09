# MeetAware – Intelligent Meeting Assistant (Backend)

MeetAware is an intelligent meeting assistant designed to help users manage meeting information, generate AI-powered summaries, and organize important decisions and action items.

This repository contains the backend services responsible for authentication, database management, meeting data processing, and communication with the frontend.

## Features

* **User Authentication:** User registration and login using JWT authentication.
* **Password Security:** Password hashing using bcrypt.
* **REST API:** Backend endpoints for frontend communication.
* **Database Integration:** MongoDB integration using Mongoose.
* **Meeting Management:** Handle meeting-related information.
* **AI-Powered Summaries:** Generate meeting summaries from supported input.
* **Transcript Management:** Support processing and storing meeting transcripts where implemented.
* **Environment Configuration:** Store sensitive configuration in environment variables.

## Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB
* **ODM:** Mongoose
* **Authentication:** JSON Web Token (JWT)
* **Password Hashing:** bcrypt
* **AI Integration:** Google Gemini API
* **File Uploads:** Multer, if enabled in the project

### Prerequisites

* Node.js and npm
* MongoDB database
* Google Gemini API key, if using AI features

## API Overview

The backend can provide endpoints for:

* User registration and login.
* Meeting-related data.
* Meeting summaries and action items.
* Transcript processing and retrieval.

Refer to the source code for the actual API routes and request formats.

## Environment Variables

| Variable         | Purpose                               |
| ---------------- | ------------------------------------- |
| `PORT`           | Backend server port                   |
| `MONGO_URI`      | MongoDB connection string             |
| `JWT_SECRET`     | Secret used for JWT authentication    |
| `GEMINI_API_KEY` | API key for Google Gemini integration |

## Security

* Passwords should be hashed before database storage.
* Protected routes should validate JWT tokens.
* Sensitive credentials must be stored in environment variables.
* Never commit `.env` files or expose API keys publicly.

## Author

**Neeraj Pathak**

GitHub: https://github.com/neerajpathak05
