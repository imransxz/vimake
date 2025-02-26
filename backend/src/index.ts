import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import videoRoutes from './routes/videoRoutes';
import dotenv from "dotenv";
dotenv.config();


const app = express();
const port = process.env.PORT || 3000;

// Créer le dossier downloads s'il n'existe pas
const downloadsPath = path.join(process.cwd(), 'downloads');
if (!fs.existsSync(downloadsPath)) {
  fs.mkdirSync(downloadsPath, { recursive: true });
}

// Enable CORS
app.use(cors());

app.use(express.json());

// Servir les fichiers statiques du dossier downloads
app.use('/downloads', express.static(path.join(process.cwd(), 'downloads')));

app.use('/api/video', videoRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 