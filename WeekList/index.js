const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv')
dotenv.config()
const authenticate = require('./middleware/authenticate');
const checkDeadline = require('./middleware/checkDeadline');

const app = express();

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());

app.set('view engine', 'ejs')

// Health API
app.get('/health', (req, res) => {
  const serverName = 'weeklist-webserver';
  const currentTime = new Date().toLocaleString();
  const status = 'active';

  res.status(200).json({
    serverName,
    currentTime,
    status,
  });
});

const User = require('./models/user');

// Signup Route
app.post('/signup', async (req, res) => {
  try {
    const { fullname, email, password, age, gender, mobile } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullname,
      email,
      password: hashedPassword,
      age,
      gender,
      mobile,
    });

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_TOKEN, {
      expiresIn: '2h',
    });
    await newUser.save();
    res.json({
      token,
      status: 'SUCCESS',
      message: 'User created successfully'
    });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login Route
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (user) {
      let hasPasswordMatched = await bcrypt.compare(password, user.password)
      if (hasPasswordMatched) {
        const token = jwt.sign(user.toJSON(), process.env.JWT_TOKEN , { expiresIn: '2h' })
        res.json({
          status: 'SUCCESS',
          message: "You've logged in successfully!",
          token
        })
      } else {
        res.json({
          status: 'FAILED',
          message: 'Incorrect credentials! Please try again'
        })
      }
    } else {
      res.json({
        status: 'FAILED',
        message: 'User does not exist'
      })
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/protected', authenticate, (req, res) => {
  res.json({ message: 'You have access to this protected route' });
});

// Add new weeklist by authorized user Id
app.post('/weeklist/:userId', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Ensure that the authenticated user is the same as the user for whom the week list is being added
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden - You do not have permission to perform this action' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const activeWeekListsCount = user.weekLists.filter(
      (weekList) => !weekList.completed && weekList.activeUntil >= new Date()
    ).length;

    if (activeWeekListsCount >= 2) {
      return res.status(400).json({ error: 'User can have only two active week lists' });
    }

    const { weekListName, description } = req.body;

    const newWeekList = {
      weekListName,
      description,
      activeUntil: new Date(+new Date() + 7 * 24 * 60 * 60 * 1000), // Active for 7 days
    };

    user.weekLists.push(newWeekList);
    await user.save();

    res.status(201).json({ message: 'Week list added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Update Week List API 
app.put('/weeklist/:userId/:weekListId', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    // Check if it's within 24 hours of creation
    const timeDifference = new Date() - weekList.createdAt;
    const hoursDifference = timeDifference / (1000 * 60 * 60);

    if (hoursDifference > 24) {
      return res.status(403).json({ error: 'Cannot update week list beyond 24 hours' });
    }

    // Update the week list 

    const { description } = req.body;
    weekList.description = description;
    await user.save();
    res.json({ message: 'Week list updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Week List API
app.delete('/weeklist/:userId/:weekListId', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    // Check if it's within 24 hours of creation
    const timeDifference = new Date() - weekList.createdAt;
    const hoursDifference = timeDifference / (1000 * 60 * 60);

    if (hoursDifference > 24) {
      return res.status(403).json({ error: 'Cannot delete week list beyond 24 hours' });
    }

    // Delete the week list
    user.weekLists.pull(weekList);
    await user.save();

    res.json({ message: 'Week list deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get All Week Lists API by authorized user id
app.get('/weeklists/:userId', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Calculate time left for each week list
    const weekListsWithTimeLeft = user.weekLists.map((weekList) => {
      const currentTime = new Date();
      const timeLeft = Math.max(weekList.activeUntil - currentTime, 0);

      const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);

      const TimeLeft = `${days} D : ${hours} H : ${minutes} M : ${seconds} S`;

      return {
        _id: weekList._id,
        description: weekList.description,
        tasks: weekList.tasks,
        TimeLeft,
        markedAsDone: weekList.completed,
        completedAt: weekList.completedAt,
      };
    });

    res.json(weekListsWithTimeLeft);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get Week List details by ID
app.get('/weeklist/:weekListId', authenticate, async (req, res) => {
  try {
    const weekListId = req.params.weekListId;

    const user = await User.findOne({ 'weekLists._id': weekListId });

    if (!user) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const currentTime = new Date();
    const timeLeftMillis = Math.max(weekList.activeUntil - currentTime, 0);

    const days = Math.floor(timeLeftMillis / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeftMillis % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeftMillis % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((timeLeftMillis % (60 * 1000)) / 1000);

    const formattedTimeLeft = `${days} D : ${hours} H : ${minutes} M : ${seconds} S`;

    res.json({
      _id: weekList._id,
      weekListName: weekList.weekListName,
      description: weekList.description,
      tasks: weekList.tasks,
      timeLeft: formattedTimeLeft,
      state: weekList.state,
      createdAt: weekList.createdAt,
      completed: weekList.completed,
      completedAt: weekList.completedAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get All Active Week Lists (Feed)
app.get('/feed', authenticate, async (req, res) => {
  try {
    const currentTime = new Date();

    const users = await User.find({
      'weekLists.activeUntil': { $gt: currentTime },
      'weekLists.state': 'active',
    });

    const activeWeekLists = users.reduce((acc, user) => {
      acc.push(...user.weekLists.filter((weekList) => weekList.activeUntil > currentTime && weekList.state === 'active'));
      return acc;
    }, []);

    res.json({ activeWeekLists });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark Week List as Done by authentic user id if it is within deadlinne
app.put('/weeklist/:userId/:weekListId/markdoneWeeklist', authenticate, checkDeadline, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    if (weekList.completed) {
      return res.status(400).json({ error: 'Week list is already marked as done' });
    }

    // Mark the weeklist as done
    weekList.completed = true;
    weekList.completedAt = new Date();
    weekList.state = 'completed';
    await user.save();

    res.json({ message: 'Week list marked as done successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add Task to Week List by week list id
app.post('/weeklist/:userId/:weekListId/addtask', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const { description } = req.body;

    weekList.tasks.push({ description });
    await user.save();

    res.status(201).json({ message: 'Task added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Task in Week List by weeklist id and task id of authorized user
app.put('/weeklist/:userId/:weekListId/:taskId/updatetask', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;
    const taskId = req.params.taskId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const task = weekList.tasks.id(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { description } = req.body;
    task.description = description;
    await user.save();

    res.json({ message: 'Task updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Task from Week List by weeklist id and task id of authorized user
app.delete('/weeklist/:userId/:weekListId/:taskId/deletetask', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;
    const taskId = req.params.taskId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const task = weekList.tasks.id(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    weekList.tasks.pull(task);
    await user.save();

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get All Tasks from Week List by weeklist id
app.get('/weeklist/:userId/:weekListId/alltasks', authenticate, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const tasks = weekList.tasks;

    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark/Unmark Task API
app.put('/weeklist/:userId/:weekListId/:taskId/markdone', authenticate, checkDeadline, async (req, res) => {
  try {
    const userId = req.params.userId;
    const weekListId = req.params.weekListId;
    const taskId = req.params.taskId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const weekList = user.weekLists.id(weekListId);

    if (!weekList) {
      return res.status(404).json({ error: 'Week list not found' });
    }

    const task = weekList.tasks.id(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.marked) {
      return res.status(400).json({ error: 'task is already marked as done' });
    }

    // Mark the weeklist as done
    task.marked = true;
    task.completedAt = new Date();
    await user.save();

    res.json({ message: 'task marked as done successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// PUBLIC ROUTE
app.get('/', (req, res) => {
  res.json({
    status: 'SUCCESS',
    message: 'All good!'
  })
})
// Route Not Found Middleware
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});


// Listen on port
app.listen(process.env.PORT, () => {
  mongoose
    .connect(process.env.MONGODB_URL)
    .then(() => console.log(`Server running on http://localhost:${process.env.PORT}`))
    .catch(error => console.error(error))
})
