Healthcare Management System

A digital platform designed to securely manage student healthcare records, streamline documentation, and improve accessibility within educational institutes.

Project Progress (50% Completed)
At this stage, we have implemented:

✅ User Authentication – Secure login/signup using JWT-based authentication.

✅ Student Dashboard – View medical history, prescriptions, and past treatments.

✅ Health Record Storage – Backend API to store & retrieve medical records.

✅ Automated Leave Documentation – System generates medical certificates and leave requests.

✅ Appointment Booking System – Initial setup for scheduling doctor appointments.

✅ Basic UI/UX – Web & mobile interfaces designed using React.js and Flutter.

Tech Stack

🖥 Frontend: React.js (Web), Flutter (Mobile)

🗄 Backend: Node.js with Express.js

💾 Database: MongoDB

🔐 Authentication: JWT & bcrypt

📡 Notifications: Twilio / Firebase Cloud Messaging

☁ Cloud Storage: AWS S3 (for medical reports & prescriptions)

How to Run the Project

1. Clone the Repository

git clone https://github.com/your-repo-link.git
cd healthcare-management-system

2. Install Dependencies
Backend Setup:

cd backend
npm install

Frontend Setup:
cd frontend
npm install

3. Configure Environment Variables
Create a .env file in the backend directory and add:

MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
AWS_ACCESS_KEY=your_aws_access_key
AWS_SECRET_KEY=your_aws_secret_key

Current Limitations & Next Steps
🔹 Pending Features: Appointment confirmation, advanced filtering, and notifications, document generation.

🔹 Next Focus: Enhancing UI, securing data with encryption, and integrating email/SMS notifications.

This guide ensures the organizers can set up and test the project easily. Let me know if you need any refinements! 🚀
