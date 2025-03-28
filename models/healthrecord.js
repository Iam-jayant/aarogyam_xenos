const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const healthRecordSchema = new Schema({
    disease: {
        type: String,
        required: true,
    },
    symptoms: {
        type: String,
        required: true,
    },
    attachments: [
        {
            type: String, // Stores file paths for reports
            required: false,
        },
    ],
    patientId: {
        type: Schema.Types.ObjectId,
        ref: "Patient",
        required: true,
    },
    doctorId: {
        type: Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
    },
    created_at: {
        type: Date,
        default: Date.now, // Automatically sets the creation date
    },
});

module.exports = mongoose.model("HealthRecord", healthRecordSchema);
