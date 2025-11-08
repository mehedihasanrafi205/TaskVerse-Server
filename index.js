const express = require('express')
const cors = require('cors');
const app = express()
const port = 3000

app.use(cors())
app.use(JSON())

app.get('/', (req, res) => {
  res.send('Server is running fine!')
})

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`)
})
