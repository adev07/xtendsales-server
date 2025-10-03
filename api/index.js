const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { body, validationResult } = require("express-validator");
require("dotenv").config();

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === "/health" || req.path === "/";
  },
});

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Create nodemailer transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Validation middleware
const contactValidation = [
  body("firstName")
    .trim()
    .isLength({ min: 1 })
    .withMessage("First name is required"),
  body("lastName")
    .trim()
    .isLength({ min: 1 })
    .withMessage("Last name is required"),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("phone")
    .optional()
    .isMobilePhone()
    .withMessage("Valid phone number required"),
  body("company").optional().trim(),
  body("message")
    .trim()
    .isLength({ min: 10 })
    .withMessage("Message must be at least 10 characters"),
  body("serviceType").optional().trim(),
];

// Contact form endpoint
app.post("/contact", limiter, contactValidation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { firstName, lastName, email, phone, company, message, serviceType } =
      req.body;

    // Create transporter
    const transporter = createTransporter();

    // Email content
    const mailOptions = {
      from: process.env.FROM_EMAIL, // Your authenticated email
      to: process.env.TO_EMAIL,
      replyTo: email, // Customer's email for easy replies
      subject: `Contact Form Submission - ${serviceType || "General Inquiry"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #007bff; margin-top: 0;">Contact Information</h3>
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
            <p><strong>Company:</strong> ${company || "Not provided"}</p>
            <p><strong>Service Type:</strong> ${
              serviceType || "General Inquiry"
            }</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Message</h3>
            <p style="line-height: 1.6; color: #555;">${message}</p>
          </div>
          
          <div style="margin-top: 30px; padding: 15px; background-color: #e9ecef; border-radius: 5px; font-size: 12px; color: #666;">
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>IP Address:</strong> ${req.ip}</p>
          </div>
        </div>
      `,
      text: `
        New Contact Form Submission
        
        Name: ${firstName} ${lastName}
        Email: ${email}
        Phone: ${phone || "Not provided"}
        Company: ${company || "Not provided"}
        Service Type: ${serviceType || "General Inquiry"}
        
        Message:
        ${message}
        
        Submitted: ${new Date().toLocaleString()}
        IP Address: ${req.ip}
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent successfully:", info.messageId);

    res.json({
      success: true,
      message: "Thank you for your message. We will get back to you soon!",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({
      success: false,
      message:
        "Failed to send message. Please try again later or contact us directly.",
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "XtendSales API is running",
    endpoints: {
      health: "/health",
      contact: "/contact (POST)",
    },
  });
});

// Test endpoint to debug routing
app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Test endpoint working",
    path: req.path,
    method: req.method,
  });
});

// Simple contact test endpoint
app.get("/contact", (req, res) => {
  res.json({
    success: true,
    message: "Contact endpoint is reachable via GET",
    note: "Use POST method to submit contact form",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Export the Express app (DO NOT use app.listen() for Vercel)
module.exports = app;
