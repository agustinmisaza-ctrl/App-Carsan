const fs = require('fs');
const path = require('path');
const dir = './migrated_prompt_history';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
let allPrompts = '';

files.forEach(file => {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  data.forEach(entry => {
    if (entry.author === 'user' && entry.payload && entry.payload.text) {
      let ts = 'Unknown Time';
      try {
        ts = new Date(Number(entry.createdTimestamp)).toISOString();
      } catch (e) {
        ts = String(entry.createdTimestamp);
      }
      allPrompts += '--- Prompt from ' + ts + ' ---\n';
      allPrompts += entry.payload.text + '\n\n';
    }
  });
});

if (!fs.existsSync('./public')) {
  fs.mkdirSync('./public');
}
fs.writeFileSync('./public/user_prompts.txt', allPrompts);
console.log('Prompts extracted to public/user_prompts.txt');
