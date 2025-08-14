export default function handler(req, res) {
  res.writeHead(302, { Location: '/api/grid?cols=3&gap=8&radius=12&size=60&captions=false' });
  res.end();
}
