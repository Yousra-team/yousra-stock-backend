import { app } from './app';

const port = Number(process.env['PORT'] ?? 8000);
app.listen(port, () => {
  console.log(`Yousra Stock API listening on port ${port}`);
  console.log(`Docs: http://localhost:${port}/api/v1/docs`);
});
