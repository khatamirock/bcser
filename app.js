require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: process.env.DB_NAME
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Set up middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Define MongoDB models
const QuestionSchema = new mongoose.Schema({
  type: String,
  hierarchy: String,
  question: String,
  options: [String],
  answer: String,
  explanation: String,
  tags: [String]
});

const Question = mongoose.model('Question', QuestionSchema);

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Routes
app.get('/', async (req, res) => {
  try {
    const hierarchies = await Question.distinct('hierarchy');
    res.render('index', { hierarchies });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching hierarchies');
  }
});

app.get('/test', async (req, res) => {
  try {
    const tag = req.query.tag || '';
    const hierarchy = req.query.hierarchy || '';
    const limit = parseInt(req.query.limit) || 100;
    
    let query = {};
    if (tag) query.tags = tag;
    if (hierarchy) query.hierarchy = req.query.hierarchy;
    
    const questions = await Question.find(query).limit(limit);
    res.render('test', { questions, tag, hierarchy, limit });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching questions');
  }
});

app.post('/test', async (req, res) => {
  try {
    const tag = req.query.tag || '';
    const hierarchy = req.query.hierarchy || '';
    const limit = parseInt(req.query.limit) || 100;

    let query = {};
    if (tag) query.tags = tag;
    if (hierarchy) query.hierarchy = req.query.hierarchy;

    const questions = await Question.find(query).limit(limit);
    let score = 0;
    questions.forEach((question, index) => {
      const selected = req.body[`q${index}`];
      if (selected) {
        const answerIndexMap = {
          "ক": 0,
          "খ": 1,
          "গ": 2,
          "ঘ": 3
        };
        const correctIndex = answerIndexMap[question.answer];
        if (parseInt(selected) === correctIndex) {
          score++;
        }
      }
    });
    const scoreData = {
      score: score,
      total: questions.length,
      date: new Date(),
      tag: tag || null,
      hierarchy: hierarchy || null
    };

    // Save the score to MongoDB
    mongoose.connection.db.collection('newstest/answers').insertOne(scoreData, (err, result) => {
      if (err) {
        console.error("Failed to save score:", err);
        res.status(500).send('Error saving score');
      } else {
        console.log("Score saved successfully");
        res.send(`Your score: ${score} out of ${questions.length}`);
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error submitting test');
  }
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

// File upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }
    
    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    const questions = parseMCQFile(fileContent);
    
    // Insert questions to database
    if (questions.length > 0) {
      await Question.insertMany(questions);
      fs.unlinkSync(req.file.path); // Clean up uploaded file
      res.redirect('/?success=true');
    } else {
      res.status(400).send('No valid questions found in file');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing file');
  }
});

// Helper function to parse MCQ file
function parseMCQFile(content) {
  const lines = content.split('\n');
  const questions = [];
  
  lines.forEach(line => {
    if (!line.trim()) return;
    
    // Split by tabs as per your format
    const parts = line.split('\t');
    
    if (parts.length >= 8) {
      questions.push({
        type: parts[0],
        hierarchy: parts[1],
        question: parts[2],
        options: [parts[3], parts[4], parts[5], parts[6]],
        answer: parts[7],
        explanation: parts[8] || '',
        tags: parts[9] ? parts[9].split(' ') : []
      });
    }
  });
  
  return questions;
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
