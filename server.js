const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const cron = require('node-cron');
const fileUpload = require('express-fileupload');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// MariaDB 연결 설정
const db_config = {
  host: process.env.DB_HOST || '218.145.156.138',
  port: process.env.DB_PORT || 10000,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_DATABASE || 'pi'
};

const pool = mysql.createPool(db_config);

// S3 클라이언트 초기화
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// 고정 항목 정의
const FIXED_ITEMS = [
  { 점검내용: 'A양액 확인', 결과: false, 비고: '', 작성자: '', 작성일: '' },
  { 점검내용: 'B양액 확인', 결과: false, 비고: '', 작성자: '', 작성일: '' }
];

// 미들웨어 설정
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.json());
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } })); // 5MB 제한
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  console.log(`Request: ${req.method} ${req.url}`);
  next();
});

// DB 초기화 및 연결
async function initializeDB() {
  try {
    const connection = await pool.getConnection();
    console.log('DB 연결 성공');

    // users 테이블 초기화
    const allowedUsers = [
      { username: 'admin', password: '1111' },
      { username: 'mhw0226', password: '1234' },
      { username: 'ju928', password: '1234' },
      { username: 'kyb', password: '1234' },
      { username: 'pjs04', password: '1234' },
      { username: 'acs', password: '1234' }
    ];

    await connection.query('DELETE FROM users');
    console.log('Existing users deleted.');
    for (const user of allowedUsers) {
      await connection.query(
        'INSERT INTO users (username, password) VALUES (?, ?) ON DUPLICATE KEY UPDATE password = ?',
        [user.username, user.password, user.password]
      );
      console.log(`User ${user.username} initialized with password ${user.password}.`);
    }

    // check_list 테이블 기본 데이터 초기화
    const defaultChecklists = [
      { name: '3동', columns: ['점검내용', '결과', '비고', '작성자', '작성일'] },
      { name: '4동', columns: ['점검내용', '결과', '비고', '작성자', '작성일'] },
      { name: '5동', columns: ['점검내용', '결과', '비고', '작성자', '작성일'] }
    ];

    for (const checklist of defaultChecklists) {
      const [result] = await connection.query(
        'INSERT INTO check_list (name, columns) VALUES (?, ?) ON DUPLICATE KEY UPDATE columns = ?',
        [checklist.name, JSON.stringify(checklist.columns), JSON.stringify(checklist.columns)]
      );
      console.log(`Checklist ${checklist.name} initialized with columns:`, checklist.columns);

      const [rows] = await connection.query('SELECT id FROM check_list WHERE name = ?', [checklist.name]);
      if (rows.length === 0) {
        console.error(`Checklist ${checklist.name} not found after insertion`);
        continue;
      }
      const checklistId = rows[0].id;

      // 기존 항목 삭제
      await connection.query('DELETE FROM checklist_items WHERE tableId = ?', [checklistId]);

      // 고정 항목 삽입
      for (let i = 0; i < FIXED_ITEMS.length; i++) {
        const item = FIXED_ITEMS[i];
        await connection.query(
          'INSERT INTO checklist_items (tableId, data, display_order, is_fixed) VALUES (?, ?, ?, ?)',
          [checklistId, JSON.stringify(item), i, true]
        );
        console.log(`Fixed item initialized for checklist ${checklist.name}:`, item);
      }
    }

    connection.release();
  } catch (err) {
    console.error('DB 초기화 실패:', err.message);
    setTimeout(initializeDB, 2000);
  }
}

// 자정마다 결과, 비고, 작성자, 작성일 초기화 (고정 항목 제외)
cron.schedule('0 0 * * *', async () => {
  console.log('Running midnight reset for 결과, 비고, 작성자, 작성일...');
  try {
    await pool.query(`
      UPDATE checklist_items
      SET data = JSON_SET(
        data,
        '$.결과', false,
        '$.비고', '',
        '$.작성자', '',
        '$.작성일', ''
      ),
      photo_url = NULL
      WHERE is_fixed = FALSE
    `);
    console.log('결과, 비고, 작성자, 작성일, 사진 reset successfully for non-fixed items.');
  } catch (err) {
    console.error('Error resetting fields:', err.message);
  }
}, {
  timezone: 'Asia/Seoul'
});

initializeDB();

// 라우팅
app.get('/', (req, res) => {
  console.log('Received request for /, serving index.html (login page)...');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/main', (req, res) => {
  console.log('Received request for /main, serving checklist.html...');
  res.sendFile(path.join(__dirname, 'public', 'checklist.html'));
});

// 로그인 API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username });
  if (!username || !password) {
    console.error('Missing username or password:', req.body);
    return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력하세요.' });
  }

  try {
    const [results] = await pool.query(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password]
    );
    console.log('Login query results:', results);
    if (results.length > 0) {
      console.log(`Login successful for user: ${username}`);
      res.json({ success: true });
    } else {
      console.log(`Login failed for user: ${username}`);
      res.json({ success: false, message: '허용되지 않은 계정 또는 잘못된 비밀번호입니다.' });
    }
  } catch (err) {
    console.error('Error during login:', err.message);
    res.status(500).json({ success: false, message: '서버 오류: ' + err.message });
  }
});

// 체크리스트 목록 조회 API
app.get('/api/checklists', async (req, res) => {
  console.log('Received request for /api/checklists');
  try {
    const [results] = await pool.query('SELECT id, name, columns FROM check_list');
    console.log('Fetched checklists:', results);
    const parsedResults = results.map(row => ({
      id: row.id,
      name: row.name,
      columns: typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns
    }));
    res.json(parsedResults);
  } catch (err) {
    console.error('Error fetching checklists:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch checklists' });
  }
});

// 단일 체크리스트 조회 API
app.get('/api/checklists/:checklistId', async (req, res) => {
  const checklistId = req.params.checklistId;
  console.log(`Received request for /api/checklists/${checklistId}`);
  try {
    const [results] = await pool.query('SELECT id, name, columns FROM check_list WHERE id = ?', [checklistId]);
    if (results.length === 0) {
      console.log(`Checklist ${checklistId} not found`);
      return res.status(404).json({ success: false, message: 'Checklist not found' });
    }
    const checklist = results[0];
    console.log(`Fetched checklist ${checklistId}:`, checklist);
    checklist.columns = typeof checklist.columns === 'string' ? JSON.parse(checklist.columns) : checklist.columns;
    res.json(checklist);
  } catch (err) {
    console.error(`Error fetching checklist ${checklistId}:`, err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch checklist' });
  }
});

// 체크리스트 생성 API
app.post('/api/checklists', async (req, res) => {
  const { name, columns } = req.body;
  const defaultColumns = columns || ['점검내용', '결과', '비고', '작성자', '작성일'];
  console.log('Creating checklist:', { name, columns: defaultColumns });
  try {
    const [result] = await pool.query(
      'INSERT INTO check_list (name, columns) VALUES (?, ?)',
      [name, JSON.stringify(defaultColumns)]
    );
    console.log('Created checklist:', { id: result.insertId, name, columns: defaultColumns });
    const checklistId = result.insertId;

    // 고정 항목 삽입
    for (let i = 0; i < FIXED_ITEMS.length; i++) {
      const item = FIXED_ITEMS[i];
      await pool.query(
        'INSERT INTO checklist_items (tableId, data, display_order, is_fixed) VALUES (?, ?, ?, ?)',
        [checklistId, JSON.stringify(item), i, true]
      );
      console.log(`Fixed item initialized for checklist ${name}:`, item);
    }

    res.json({ success: true, id: checklistId });
  } catch (err) {
    console.error('Error creating checklist:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create checklist' });
  }
});

// 체크리스트 열 업데이트 API
app.put('/api/checklists/:checklistId/columns', async (req, res) => {
  const checklistId = req.params.checklistId;
  const { columns } = req.body;
  if (!columns || !Array.isArray(columns)) {
    res.status(400).json({ success: false, message: 'Columns must be a valid array' });
    return;
  }
  console.log(`Updating columns for checklist ${checklistId}:`, columns);
  try {
    await pool.query('UPDATE check_list SET columns = ? WHERE id = ?', [JSON.stringify(columns), checklistId]);
    console.log('Updated columns for checklist', checklistId, 'to', columns);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating checklist columns:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update columns' });
  }
});

// 항목 조회 API
app.get('/api/items/:checklistId', async (req, res) => {
  const checklistId = req.params.checklistId;
  console.log(`Received request for /api/items/${checklistId}`);
  try {
    const [results] = await pool.query(
      'SELECT id, tableId, data, display_order, photo_url, is_fixed FROM checklist_items WHERE tableId = ? ORDER BY display_order',
      [checklistId]
    );
    console.log(`Fetched items for checklist ${checklistId}:`, results);
    const parsedResults = results.map(row => ({
      id: row.id,
      tableId: row.tableId,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      display_order: row.display_order,
      photo_url: row.photo_url,
      is_fixed: row.is_fixed
    }));
    res.json(parsedResults);
  } catch (err) {
    console.error('Error fetching items:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch items' });
  }
});

// 항목 추가 API
app.post('/api/items', async (req, res) => {
  const { tableId, data, display_order } = req.body;
  console.log('Adding item to checklist', tableId, ':', { data, display_order });
  try {
    const [results] = await pool.query('SELECT id FROM check_list WHERE id = ?', [tableId]);
    if (results.length === 0) {
      console.error(`Table ID ${tableId} does not exist`);
      return res.status(400).json({ success: false, message: 'Invalid tableId' });
    }
    const jsonData = JSON.stringify(data);
    const [result] = await pool.query(
      'INSERT INTO checklist_items (tableId, data, display_order, is_fixed) VALUES (?, ?, ?, ?)',
      [tableId, jsonData, display_order, false]
    );
    console.log('Added item to checklist', tableId, ':', { id: result.insertId, data, display_order });
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error adding item:', err.message);
    res.status(500).json({ success: false, message: 'Failed to add item' });
  }
});

// 항목 업데이트 API
app.put('/api/items/:id', async (req, res) => {
  const itemId = req.params.id;
  const { data, display_order } = req.body;
  console.log(`Updating item ${itemId} with data:`, data);
  try {
    const [results] = await pool.query('SELECT is_fixed FROM checklist_items WHERE id = ?', [itemId]);
    if (results.length === 0) {
      console.error(`Item ${itemId} not found`);
      return res.status(404).json({ success: false, message: `Item ${itemId} not found` });
    }
    if (results[0].is_fixed) {
      return res.status(403).json({ success: false, message: 'Cannot modify fixed item' });
    }
    const jsonData = JSON.stringify(data);
    await pool.query('UPDATE checklist_items SET data = ?, display_order = ? WHERE id = ?', [jsonData, display_order, itemId]);
    console.log('Updated item', itemId, 'with data:', data);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating item:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update item' });
  }
});

// 항목 삭제 API
app.delete('/api/items/:id', async (req, res) => {
  const itemId = req.params.id;
  console.log(`Deleting item ${itemId}`);
  try {
    const [results] = await pool.query('SELECT is_fixed FROM checklist_items WHERE id = ?', [itemId]);
    if (results.length === 0) {
      console.error(`Item ${itemId} not found`);
      return res.status(404).json({ success: false, message: `Item ${itemId} not found` });
    }
    if (results[0].is_fixed) {
      return res.status(403).json({ success: false, message: 'Cannot delete fixed item' });
    }
    await pool.query('DELETE FROM checklist_items WHERE id = ?', [itemId]);
    console.log(`Deleted item ${itemId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting item:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete item' });
  }
});

// 항목 순서 업데이트 API
app.put('/api/items/:checklistId/reorder', async (req, res) => {
  const checklistId = req.params.checklistId;
  const { items } = req.body;
  console.log(`Reordering items for checklist ${checklistId}:`, items);
  try {
    const [results] = await pool.query('SELECT id FROM check_list WHERE id = ?', [checklistId]);
    if (results.length === 0) {
      console.error(`Table ID ${checklistId} does not exist`);
      return res.status(400).json({ success: false, message: 'Invalid tableId' });
    }
    const updates = items.map((item, index) => {
      return pool.query(
        'UPDATE checklist_items SET display_order = ? WHERE id = ? AND tableId = ? AND is_fixed = FALSE',
        [index, item.id, checklistId]
      );
    });
    await Promise.all(updates);
    console.log('Reordered items for checklist', checklistId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering items:', err.message);
    res.status(500).json({ success: false, message: 'Failed to reorder items' });
  }
});

// 사진 업로드 API
app.post('/api/upload-photo', async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!req.files || !req.files.photo) {
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    const [results] = await pool.query('SELECT is_fixed FROM checklist_items WHERE id = ?', [itemId]);
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: `Item ${itemId} not found` });
    }
    if (results[0].is_fixed) {
      return res.status(403).json({ success: false, message: 'Cannot upload photo for fixed item' });
    }

    const file = req.files.photo;
    const fileName = `${Date.now()}-${file.name}`;
    const s3Params = {
      Bucket: process.env.AWS_S3_BUCKET || 'static.s3.plantee',
      Key: `images/${fileName}`,
      Body: file.data,
      ContentType: file.mimetype,
      ACL: 'public-read'
    };

    const upload = new Upload({
      client: s3Client,
      params: s3Params
    });

    await upload.done();
    const photoUrl = `https://${process.env.AWS_S3_BUCKET || 'static.s3.plantee'}.s3.${process.env.AWS_REGION || 'ap-northeast-2'}.amazonaws.com/images/${fileName}`;

    await pool.query('UPDATE checklist_items SET photo_url = ? WHERE id = ?', [photoUrl, itemId]);
    console.log(`Uploaded photo for item ${itemId}:`, photoUrl);
    res.json({ success: true, photoUrl });
  } catch (err) {
    console.error('Error uploading photo:', err.message);
    res.status(500).json({ success: false, message: 'Failed to upload photo' });
  }
});

// 체크리스트 스냅샷 저장 API
app.post('/api/snapshots', async (req, res) => {
  const { tableId, snapshot_date, columns, items, username, timestamp } = req.body;
  console.log('Received snapshot data:', { tableId, snapshot_date, columns, items, username, timestamp });
  if (!tableId || !snapshot_date || !columns || !items || !username || !timestamp) {
    console.error('Missing required fields for snapshot:', req.body);
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const [results] = await pool.query('SELECT id FROM check_list WHERE id = ?', [tableId]);
    if (results.length === 0) {
      console.error(`Table ID ${tableId} does not exist`);
      return res.status(400).json({ success: false, message: 'Invalid tableId' });
    }

    const snapshotItems = items.map(item => ({
      id: item.id,
      data: JSON.stringify(item.data),
      display_order: item.display_order,
      photo_url: item.photo_url,
      is_fixed: item.is_fixed
    }));
    const columnsJson = JSON.stringify(columns);
    const itemsJson = JSON.stringify(snapshotItems);
    const [result] = await pool.query(
      'INSERT INTO checklist_snapshots (table_id, snapshot_date, columns, items, username, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [tableId, snapshot_date, columnsJson, itemsJson, username, timestamp]
    );
    console.log('Saved snapshot:', { id: result.insertId, tableId, snapshot_date });
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error saving snapshot:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save snapshot' });
  }
});

// 스냅샷 조회 API
app.get('/api/snapshots', async (req, res) => {
  const { date, tableId } = req.query;
  console.log('Query parameters:', { date, tableId });
  if (!date || !tableId) {
    console.error('Missing date or tableId:', req.query);
    return res.status(400).json({ success: false, message: 'Missing date or tableId' });
  }
  try {
    const [results] = await pool.query(
      'SELECT columns, items FROM checklist_snapshots WHERE snapshot_date LIKE ? AND table_id = ? ORDER BY timestamp DESC LIMIT 1',
      [`${date}%`, tableId]
    );
    if (results.length > 0) {
      const rawData = results[0];
      console.log('Raw snapshot data from DB:', { rawColumns: rawData.columns, rawItems: rawData.items });
      const columns = typeof rawData.columns === 'string' ? JSON.parse(rawData.columns) : rawData.columns;
      const items = typeof rawData.items === 'string' ? JSON.parse(rawData.items) : rawData.items;
      console.log('Parsed snapshot data:', { columns, items });
      return res.json({ success: true, columns, items });
    }

    // 스냅샷이 없는 경우 현재 데이터 반환
    console.log(`No snapshot found for date ${date} and table ${tableId}, fetching current items`);
    const [itemResults] = await pool.query(
      'SELECT id, data, display_order, photo_url, is_fixed FROM checklist_items WHERE tableId = ? ORDER BY display_order',
      [tableId]
    );
    const [checklistResults] = await pool.query('SELECT columns FROM check_list WHERE id = ?', [tableId]);
    if (checklistResults.length === 0) {
      console.error('Checklist not found');
      return res.status(404).json({ success: false, message: 'Checklist not found' });
    }
    const columns = typeof checklistResults[0].columns === 'string' ? JSON.parse(checklistResults[0].columns) : checklistResults[0].columns;
    const items = itemResults.map(row => ({
      id: row.id,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      display_order: row.display_order,
      photo_url: row.photo_url,
      is_fixed: row.is_fixed
    }));
    console.log('Returning current data for date:', { columns, items });
    res.json({ success: true, columns, items });
  } catch (err) {
    console.error('Error fetching snapshot:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch snapshot' });
  }
});

// 서버 시작
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});