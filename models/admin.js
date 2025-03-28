const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const adminSchema = new Schema ({
    email: {
        type: String,
        required: true,
        unique: true
    },
    hospitalName: {
        type: String,
        required: true
    },
    profile: {
        type: String,
    },
    phone: {
        type: String,
        required: true
    },
    patients: [
        {
            type: Schema.Types.ObjectId,
            ref: "Patient"
        }
    ],
    doctors: [
        {
            type: Schema.Types.ObjectId,
            ref: "Doctor"
        }
    ],
    appointments: [
        {
            type: Schema.Types.ObjectId,
            ref: "Appointment"
        }
    ],
}, {
    timestamps: true
});

adminSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("Admin", adminSchema);
