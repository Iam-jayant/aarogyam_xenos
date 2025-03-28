const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const engine = require('ejs-mate');
const flash = require("connect-flash");
const session = require("express-session");
const methodOverride = require("method-override");
const multer = require("multer");
const bodyParser = require("body-parser");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const twilio = require("twilio");
const sendSMS = require("./utils/twilio");
const cron = require("node-cron");

const passport = require("passport");
const LocalStrategy = require("passport-local");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "public")));
app.engine('ejs', engine);
app.use(methodOverride("_method"));
app.use('/uploads', express.static('uploads'));

// -----------------------------------
// 🔹 MODELS
// -----------------------------------

const Doctor = require("./models/doctor");
const Patient = require("./models/patient");
const Appointment = require("./models/appointment");
const HealthRecord = require("./models/healthrecord"); 
const Billing = require("./models/billing");

// -----------------------------------
// 🔹 MONGODB CONNECTION
// -----------------------------------

const MongoUrl = "mongodb://127.0.0.1:27017/aarogyam";

main()
  .then(() => console.log("Connected to DB"))
  .catch((err) => console.error("Error:", err));

async function main() {
  await mongoose.connect(MongoUrl);
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Ensure the "uploads" folder exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const sessionOptions = {
  secret: "mysecretstring",
  resave: false,
  saveUninitialized: true,
  cookie: {
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
  }
};

app.use(session(sessionOptions));

app.use(passport.initialize());
app.use(passport.session());

// Configure Passport for Doctor authentication
passport.use("doctor-local", new LocalStrategy(Doctor.authenticate()));
passport.use("patient-local", new LocalStrategy(Patient.authenticate()));

// 🛠️ Custom serializeUser & deserializeUser to distinguish user types
passport.serializeUser((user, done) => {
  done(null, { id: user.id, role: user instanceof Doctor ? "doctor" : "patient" });
});

passport.deserializeUser(async (data, done) => {
  try {
    if (data.role === "doctor") {
      const doctor = await Doctor.findById(data.id);
      done(null, doctor);
    } else {
      const patient = await Patient.findById(data.id);
      done(null, patient);
    }
  } catch (err) {
    done(err);
  }
});

// -----------------------------------
// 🔹 HOME PAGE
// -----------------------------------

app.get("/aarogyam", (req, res) => res.render("dashboard"));

// -----------------------------------
// 🔹 AUTH ROUTES
// -----------------------------------

app.get("/login", (req, res) => res.render("auth/login/login"));
app.get("/signup", (req, res) => res.render("auth/signup/signup"));

app.get("/signup/doctor", (req, res) => res.render("auth/signup/doctor"));
app.get("/signup/patient", (req, res) => res.render("auth/signup/patient"));

app.post("/login", async (req, res, next) => {
  try {
    const { username } = req.body;

    // Check if the user exists as a Doctor
    const doctor = await Doctor.findOne({ username });
    if (doctor) {
      passport.authenticate("doctor-local", async (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.redirect("/login"); // Failed login

        req.logIn(user, async (err) => {
          if (err) return next(err);

          // Fetch full doctor details using ID
          const loggedInDoctor = await Doctor.findById(user._id);
          return res.render("doctor/dashboard", { doctor: loggedInDoctor });
        });
      })(req, res, next);
      return;
    }

    // Check if the user exists as a Patient
    const patient = await Patient.findOne({ username });
    if (patient) {
      passport.authenticate("patient-local", async (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.redirect("/login"); // Failed login

        req.logIn(user, async (err) => {
          if (err) return next(err);

          // Fetch full patient details using ID
          const loggedInPatient = await Patient.findById(user._id);
          return res.render("patient/dashboard", { patient: loggedInPatient });
        });
      })(req, res, next);
      return;
    }

    // If neither a doctor nor a patient, redirect to login
    res.redirect("/login");

  } catch (error) {
    console.error("Error during login:", error);
    res.redirect("/login");
  }
});

// Doctor Signup Route
app.post("/signup/doctor", upload.single("profile"), async (req, res) => {
  try {
      // Extract doctor details from form submission
      const { email, username, password, specialization, experience, hospital, consultantFees, phone } = req.body.doctor;

      // Create new Doctor instance
      const newDoctor = new Doctor({
        email,
        username,
        specialization,
        experience,
        hospital,
        consultantFees,
        phone,
        profile: req.file ? `/uploads/${req.file.filename}` : null  // Store image path
    });

      // Register doctor with hashed password
      await Doctor.register(newDoctor, password);

      // Authenticate and log in user after signup
      req.login(newDoctor, async (err) => {
          if (err) return next(err);

          // Fetch the doctor from the database using req.user._id
          const doctor = await Doctor.findById(req.user._id);

          if (!doctor) {
            return res.redirect("/signup/doctor"); // Redirect if doctor is not found
          }

          // Pass the doctor object to the dashboard
          res.render("doctor/dashboard", { doctor });
      });
  } catch (err) {
      console.error("Error during doctor signup:", err);
      res.redirect("/signup/doctor");  // Redirect back to signup form on failure
  }
});

app.post("/signup/patient", async (req, res) => {
  try {
      const { username, email, password, gender, age, height, weight, bloodType } = req.body.patient;
      const newPatient = new Patient({ username, email, gender, age, height, weight, bloodType });
      const registeredPatient = await Patient.register(newPatient, password);
      req.login(registeredPatient, (err) => {
          if (err) return next(err);
          res.redirect("/patient/dashboard");
      });
  } catch (error) {
      res.status(500).send("Error registering patient: " + error.message);
  }
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
      if (err) {
          console.error("Logout error:", err);
          return res.redirect("/"); // Redirect to home or login page
      }
      req.session.destroy(() => {
          res.redirect("/login"); // Redirect after session is cleared
      });
  });
});

// ------------------------------------
// 🔹 PATIENT ROUTES
// ------------------------------------

// New corrected code (paste this)
app.get("/patient/dashboard", async (req, res) => {
  try {
    const patientId = req.user ? req.user._id : "67b6d14db339e23694c73bf9";
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).send("Patient not found");

    // Fetch related data
    const appointments = await Appointment.find({ patientId })
      .sort({ date: 1 })
      .limit(3)
      .populate('doctorId');

    const medicalRecords = await HealthRecord.find({ patientId })
      .sort({ date: -1 })
      .limit(3);

    const billing = await Billing.find({ patientId })
      .sort({ date: -1 })
      .limit(3);

    res.render("patient/dashboard", {
      patient,
      appointments,
      medicalRecords,
      billing
    });
  } catch (err) {
    console.error("Error fetching dashboard data:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/patient/todaysappointments", async (req, res) => {
  try {
    const patientId = req.user && req.user._id ? req.user._id : "67b6d14db339e23694c73bf9";
    const appointments = await Appointment.find({ patientId })
      .populate("patientId")
      .populate("doctorId");

    res.render("patient/appointments/todaysappointments", { appointments });
  } catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// Appointment cancel route

app.delete("/patient/todaysappointments/cancel/:id", async (req, res) => {
  try {
      const { id } = req.params // Default ID if `id` is undefined
      const deletedAppointment = await Appointment.findByIdAndDelete(id);

      // req.flash("success", "Appointment canceled successfully!");
      res.redirect("/patient/todaysappointments");
  } catch (error) {
      console.error("Error canceling appointment:", error);
      // req.flash("error", "Internal Server Error");
      res.redirect("/patient/todaysappointments");
  }
});

app.get("/patient/appointments", async (req, res) => {
  try {
      const { search, date, status, timeSlot } = req.query;
      let filter = {};

      // Apply direct filters first
      if (date) filter.date = date;
      if (status) filter.status = status;
      if (timeSlot) filter.timeSlot = timeSlot;

      // Fetch appointments with populated doctor details
      let appointments = await Appointment.find(filter).populate("doctorId");

      // Apply search filter after population (for doctor name)
      if (search) {
          appointments = appointments.filter(appointment =>
              appointment.doctorId.username.toLowerCase().includes(search.toLowerCase()) ||
              appointment.reason.toLowerCase().includes(search.toLowerCase()) ||
              appointment.disease.toLowerCase().includes(search.toLowerCase())
          );
      }

      res.render("patient/appointments/todaysappointments", { appointments });
  } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).send("Internal Server Error");
  }
});

app.get("/patient/bookappointment", async (req, res) => {
  try {
    const doctors = await Doctor.find();
    res.render("patient/appointments/bookappointment", { doctors });
  } catch (err) {
    console.error("Error rendering appointment booking page:", err);
    res.status(500).render("error", { message: "Internal Server Error" });
  }
});

app.get("/patient/healthrecords", async (req, res) => {
  try {
    const patientId = req.user && req.user._id ? req.user._id : "67b6d14db339e23694c73bf9";
    const records = await HealthRecord.find({ patientId })
    .populate("doctorId");

    res.render("patient/healthrecords", { records });
  } catch (err) {
    console.error("Error fetching health records:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get("/patient/prescriptions", async (req, res) => {
  try {
    const patientId = req.user && req.user._id ? req.user._id : "67b6d14db339e23694c73bf9";
    const appointments = await Appointment.find({ patientId: patientId }).populate("doctorId");

    res.render("patient/prescriptions", { appointments });
  } catch (err) {
    console.error("Error fetching prescriptions:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// Prescription delete route

app.post('/patient/prescriptions/delete/:id', async (req, res) => {
  try {
      const appointmentId = req.params.id;
      const filePath = req.query.file; // Get file path from query params

      // Find the appointment
      const appointment = await Appointment.findById(appointmentId);

      // Remove the file from attachments array
      appointment.attachments = appointment.attachments.filter(file => file !== filePath);

      // Save updated appointment
      await appointment.save();

      // req.flash('success', 'Prescription deleted successfully.');
      res.redirect('back'); // Redirect to the same page
  } catch (error) {
      console.error('Error deleting prescription:', error);
      // req.flash('error', 'Something went wrong.');
      res.redirect('back');
  }
});

app.get("/patient/billings", async (req, res) => {
  try {
    const patientId = req.user && req.user._id ? req.user._id : "67b6d14db339e23694c73bf9";
    const bills = await Billing.find({ patientId: patientId }).populate("doctorId");

    res.render("patient/billings", { bills });
  } catch (err) {
    console.error("Error fetching billings:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

// Billing delete route

app.post('/patient/billings/delete/:id', async (req, res) => {
  try {
      const billingId = req.params.id;
      const filePath = req.query.file; // Get file path from query params

      // Find the appointment
      const billing = await Billing.findById(billingId);

      // Remove the file from attachments array
      billing.attachments = billing.attachments.filter(file => file !== filePath);

      // Save updated appointment
      await billing.save();

      // req.flash('success', 'Prescription deleted successfully.');
      res.redirect('back'); // Redirect to the same page
  } catch (error) {
      console.error('Error deleting prescription:', error);
      // req.flash('error', 'Something went wrong.');
      res.redirect('back');
  }
});

app.get("/patient/doctors", async (req, res) => {
  try {
      const patientId = req.user ? req.user._id : "67b6d14db339e23694c73bf9"; // Get from req.user or default

      const patient = await Patient.findById(patientId).populate("doctors"); // Populate doctors field

      if (!patient) {
          return res.status(404).send("Patient not found");
      }

      // console.log(patient.doctors);

      res.render("patient/doctors", { doctors: patient.doctors });
  } catch (error) {
      console.error(error);
      res.status(500).send("Internal Server Error");
  }
});

// ------------------------------------
// 🔹 PATIENT POST ROUTES
// ------------------------------------

app.post("/bookappointment", /* isAuthenticated */ async (req, res) => {
  try {
      // Ensure user is authenticated
      if (!req.user) {
          return res.status(401).json({ message: "Unauthorized: Please log in." });
      }

      // Extract the logged-in patient's ID from req.user
      const patientId = req.user._id;

      // Extract required form data
      const { doctorId, appointmentDate, timeSlot, reason } = req.body.patient;

      // Create a new appointment
      const newAppointment = new Appointment({
          patientId,
          doctorId,
          date: new Date(appointmentDate),
          timeSlot,
          status: "pending",
          reason,
          notes: "",
          disease: "",
          summary: "",
          attachments: []
      });

      // Save the new appointment
      const savedAppointment = await newAppointment.save();

      // Add this appointment's ID to the doctor's appointments array
      await Doctor.findByIdAndUpdate(doctorId, { $push: { appointments: savedAppointment._id } });

      // Add this appointment's ID to the patient's appointments array
      await Patient.findByIdAndUpdate(patientId, { $push: { appointments: savedAppointment._id } });

      // req.flash("success", "Appointment booked successfully!");
      res.redirect("/patient/bookappointment");
  } catch (error) {
      console.error("Error booking appointment:", error);
      // req.flash("error", "Failed to book appointment. Please try again.");
      res.status(500).json({ message: "Internal Server Error" });
  }
});

// ------------------------------------
// 🔹 DOCTOR ROUTES
// ------------------------------------

app.get("/doctor/dashboard", async (req, res) => {
  try {
    const doctorId = req.user && req.user._id ? req.user._id : "67b6d17ab339e23694c73bfb";
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });

    // console.log(doctorId);
    // console.log(doctor);
    res.render("doctor/dashboard", { doctor });
  } catch (err) {
    console.error("Error fetching doctor data:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get("/doctor/appointments", async (req, res) => {
  try {
    const doctorId = req.user._id;  // Change to dynamic session-based ID
    const appointments = await Appointment.find({ doctorId })
      .populate("patientId")

    res.render("doctor/appointments", { appointments });
  } catch (err) {
    console.error("Error fetching doctor appointments:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get("/doctor/appointments/addAppointmentDetails/:id", async (req, res) => {
  try {
    const appointmentId = req.params.id;
    const appointment = await Appointment.findById(appointmentId).populate("patientId");

    // if (!appointment) {
    //   return res.status(404).json({ error: "Appointment not found" });
    // }

    res.render("doctor/addAppointment", { appointment });
  } catch (err) {
    console.error("Error fetching appointment:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get("/doctor/appointments/edit/:id", async (req, res) => {
  try {
    const appointmentId = req.params.id;

    // Fetch appointment, health record, and billing data
    const appointment = await Appointment.findById(appointmentId)
    .populate("patientId");
    if (!appointment) {
      return res.status(404).send("Appointment not found");
    }

    const healthRecord = await HealthRecord.findOne({ patientId: appointment.patientId });
    const billing = await Billing.findOne({ patientId: appointment.patientId });

    // Render the edit form with existing data
    res.render("doctor/editAppointment", {
      appointment,
      healthRecord,
      billing,
    });
  } catch (err) {
    console.error("Error fetching data for edit:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/doctor/patients", async (req, res) => {
  try {
    const doctorId = req.user._id;

    const doctor = await Doctor.findById(doctorId).populate("patients");
    if (!doctor) {
      return res.status(404).send("Doctor not found");
    }

    res.render("doctor/patients", { doctor });
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/doctor/patient/:id/healthrecords", async (req, res) => {
  try {
      const patientId = req.params.id;

      const patient = await Patient.findById(patientId);
      const healthrecords = await HealthRecord.find({ patientId: patientId });

      res.render("doctor/healthrecords", { healthrecords, patient });
  } catch (error) {
      console.error(error);
      res.status(500).send("Server Error");
  }
});

app.get("/doctor/:doctorId/patient/:patientId/prescriptions", async (req, res) => {
  try {
      const { doctorId, patientId } = req.params;

      // Fetch the patient details
      const patient = await Patient.findById(patientId);
      if (!patient) {
          return res.status(404).send("Patient not found");
      }

      // Fetch all appointments between this doctor and patient
      const appointments = await Appointment.find({ doctorId: doctorId, patientId: patientId })
          .populate("attachments"); // Attachments contain prescriptions

      res.render("doctor/prescriptions", { appointments, patient });
  } catch (error) {
      console.error(error);
      res.status(500).send("Server Error");
  }
});

// Serve certificates statically
app.use('/certificates', express.static(path.join(__dirname, 'certificates')));

app.post('/generate-certificate/:patientId', async (req, res) => {
  try {
      const { admissionDate, dischargeDate } = req.body;
      const patient = await Patient.findById(req.params.patientId).populate('doctors');

      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      const fileName = `medical_certificate_${patient._id}.pdf`;
      const filePath = path.join(__dirname, 'certificates', fileName);

      // Create certificates folder if it doesn't exist
      if (!fs.existsSync(path.join(__dirname, 'certificates'))) {
          fs.mkdirSync(path.join(__dirname, 'certificates'));
      }

      // Create PDF document
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // PDF Content
      doc.fontSize(20).text('Medical Leave Certificate', { align: 'center' }).moveDown();
      doc.fontSize(12).text(`Patient Name: ${patient.username}`);
      doc.text(`Email: ${patient.email}`);
      doc.text(`Gender: ${patient.gender}`);
      doc.text(`Age: ${patient.age}`);
      doc.text(`Blood Type: ${patient.bloodType}`);
      doc.text(`Doctor: ${patient.doctors[0]?.name || 'N/A'}`);
      doc.text(`Admission Date: ${admissionDate}`);
      doc.text(`Discharge Date: ${dischargeDate}`);
      doc.moveDown();
      doc.text(`This is to certify that ${patient.username} was admitted from ${admissionDate} to ${dischargeDate} and requires medical leave.`);

      // Signature Placeholder
      doc.moveDown();
      doc.text('_________________________');
      doc.text("Doctor's Signature");

      doc.end();

      stream.on('finish', () => res.json({ fileUrl: `/certificates/${fileName}` }));
      stream.on('error', err => res.status(500).json({ error: 'Error generating certificate' }));

  } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------
// 🔹 DOCTOR POST ROUTES
// ------------------------------------

app.post(
  "/doctor/appointments/addAppointmentDetails/:id",
  upload.fields([
    { name: "patient[prescription]", maxCount: 1 },
    { name: "patient[medicalReports]", maxCount: 5 },
    { name: "patient[bill]", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const appointmentId = req.params.id;
      
      const { username, email, gender, appointmentDate, timeSlot, symptoms, disease } = req.body.patient;

      // Extract file paths
      const prescriptionUrl = req.files["patient[prescription]"]
        ? req.files["patient[prescription]"][0].path
        : null;
      const medicalReports = req.files["patient[medicalReports]"]
        ? req.files["patient[medicalReports]"].map((file) => file.path)
        : [];
      const billUrl = req.files["patient[bill]"]
        ? req.files["patient[bill]"][0].path
        : null;

      // Find appointment and update fields
      const appointment = await Appointment.findById(appointmentId);

      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      appointment.disease = disease;
      appointment.summary = symptoms;
      if (prescriptionUrl) {
        appointment.attachments.push(prescriptionUrl);
      }
      const updatedAppointment = await appointment.save();

      // console.log(updatedAppointment);

      // Create new health record
      const healthRecord = new HealthRecord({
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        disease: disease,
        symptoms: symptoms,
        attachments: medicalReports,
      });
      await healthRecord.save();

      // console.log(healthRecord);

      // Create new billing record
      const invoiceNo = `INV-${Math.floor(Math.random() * 9000) + 1000}`;
      const billing = new Billing({
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        invoiceNo: invoiceNo,
        date: new Date(),
        amount: 0, // To be updated later
        reason: disease,
        status: "paid",
        paymentMethod: "cash",
        attachments: billUrl ? [billUrl] : [],
      });
      await billing.save();

      // console.log(billing);

      res.redirect("/doctor/appointments");
    } catch (err) {
      console.error("Error updating records:", err);
      res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  }
);

app.post(
  "/doctor/appointments/edit/:id",
  upload.fields([
    { name: "patient[prescription]", maxCount: 1 },
    { name: "patient[medicalReports]", maxCount: 5 },
    { name: "patient[bill]", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const appointmentId = req.params.id;
      const { symptoms, disease } = req.body.patient;

      if (!disease || !symptoms) {
        return res.status(400).json({ error: "Disease and symptoms are required" });
      }

      // Extract file paths safely
      const prescriptionUrl = req.files?.["patient[prescription]"]?.[0]?.path || null;
      const medicalReports = req.files?.["patient[medicalReports]"]
        ? req.files["patient[medicalReports]"].map((file) => file.path)
        : [];
      const billUrl = req.files?.["patient[bill]"]?.[0]?.path || null;

      // Find and update appointment
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) return res.status(404).json({ error: "Appointment not found" });

      appointment.disease = disease;
      appointment.summary = symptoms;
      if (prescriptionUrl) {
        appointment.attachments = []; // Empty the array
        appointment.attachments.push(prescriptionUrl);
      }
      await appointment.save();

      // Find and update health record
      const healthRecord = await HealthRecord.findOne({ patientId: appointment.patientId });
      if (healthRecord) {
        healthRecord.disease = disease;
        healthRecord.symptoms = symptoms;
        if (medicalReports.length > 0) {
          healthRecord.attachments = medicalReports;
        }
        await healthRecord.save();
      }

      // Find and update billing record
      const billing = await Billing.findOne({ patientId: appointment.patientId });
      if (billing) {
        billing.reason = disease;
        if (billUrl) {
          billing.attachments = [billUrl];
        }
        await billing.save();
      }

      res.redirect("/doctor/appointments");
    } catch (err) {
      console.error("Error updating records:", err);
      res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  }
);

app.post("/doctor/appointments/confirm/:id", async (req, res) => {
  try {
    const appointmentId = req.params.id;

    // Find the appointment by ID
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Update appointment status to "confirmed"
    appointment.status = "confirmed";
    await appointment.save();

    // Add patientId to the doctor's `patients` array
    await Doctor.findByIdAndUpdate(appointment.doctorId, {
      $addToSet: { patients: appointment.patientId } // Prevents duplicates
    });

    // Add doctorId to the patient's `doctors` array
    await Patient.findByIdAndUpdate(appointment.patientId, {
      $addToSet: { doctors: appointment.doctorId } // Prevents duplicates
    });

    res.redirect("/doctor/appointments");
  } catch (err) {
    console.error("Error confirming appointment:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});
// ------------------------------
// 🔹 VIDEO CONSULTATION ROUTES
// ------------------------------

// GET route to render the video consultation booking form
app.get("/videoconsultation", async (req, res) => {
  try {
    // Fetch all doctors to populate the dropdown
    const doctors = await require("./models/doctor").find();
    res.render("patient/videoconsultation", { doctors, user: req.user });
  } catch (err) {
    console.error("Error loading video consultation form:", err);
    res.status(500).send("Internal Server Error");
  }
});

// POST route to handle form submission for booking a video consultation
app.post("/videoconsultation/book", async (req, res) => {
  try {
    // Extract data from the form
    const { doctorId, appointmentDate, timeSlot, symptoms } = req.body;
    const patientId = req.user._id; // Assumes the patient is logged in

    // Create a new appointment (customize fields as needed)
    const Appointment = require("./models/appointment");
    const newAppointment = new Appointment({
      patientId,
      doctorId,
      date: new Date(appointmentDate),
      timeSlot,
      symptoms,
      status: "videoconsultation", // Custom status flag
      reason: "Video Consultation"
    });
    await newAppointment.save();

    // Generate a unique Jitsi Meet room link
    const roomId = "room-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5);
    const videoURL = `https://meet.jit.si/${roomId}`;

    // Save the video URL with the appointment
    newAppointment.jitsiLink = videoURL;
    await newAppointment.save();

    // Redirect to the video consultation page where the call will start
    res.redirect("/videoconsultation/room/" + newAppointment._id);
  } catch (error) {
    console.error("Error booking video consultation:", error);
    res.status(500).send("Internal Server Error");
  }
});

// GET route to render the video consultation room (Jitsi Meet integration)
app.get("/videoconsultation/room/:appointmentId", async (req, res) => {
  try {
    const Appointment = require("./models/appointment");
    const appointment = await Appointment.findById(req.params.appointmentId);
    if (!appointment) {
      return res.status(404).send("Appointment not found");
    }
    // Render a view (e.g., views/patient/videocall.ejs) that contains the Jitsi Meet iframe
    res.render("patient/videocall", { videoURL: appointment.jitsiLink });
  } catch (error) {
    console.error("Error loading video consultation room:", error);
    res.status(500).send("Internal Server Error");
  }
});
//video routes 



// ------------------------------------
// 🔹 SERVER LISTENING
// ------------------------------------
const port = 5000;
app.listen(port, () => {
  console.log("Server is running on http://localhost:5000/aarogyam");
});
