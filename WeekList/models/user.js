const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    description: String,
    marked: { type: Boolean, default: false },
    completedAt: Date,
  });

const weekListSchema = new mongoose.Schema({
    weekListName: String,
    description: String,
    tasks: [
        taskSchema
    ],
    createdAt: { type: Date, default: Date.now },
    activeUntil: { type: Date, default: () => new Date(+new Date() + 7 * 24 * 60 * 60 * 1000) }, // Active for 7 days
    state: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active' },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
});

const userSchema = new mongoose.Schema({
    fullname: String,
    email: { type: String, unique: true },
    password: String,
    age: Number,
    gender: String,
    mobile: String,
    weekLists: [weekListSchema],
});

const User = mongoose.model('WeekListUser', userSchema);

module.exports = User;
