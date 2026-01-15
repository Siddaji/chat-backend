# AI Chat Backend

Backend service for an AI chat application built using Node.js,Express,and OpenAI API.
This API processes chat messages and returns AI-generated responses.

## Live Demo

https://chat-backend-w3yw.onrender.com

## Features

-REST API for AI chat
-Integration with OpenAI API
-Secure environmental variable usage
-CORS enabled for frontend access

## Tech Stack

-Node.js
-Express.js
-OpenAI SDK
-dotenv
-CORS

## Run Locally

npm install
node index.js

Server runs on: https://localhost:5000

## Environment Variables

Create a `.env` file in the root:
OPEN_API_KEY=your_openai_key
PORT=5000

## Notes

This backend is deployed seperately and used by the frontend application.