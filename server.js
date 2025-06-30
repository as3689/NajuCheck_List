const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const cron = require('node-cron');
const app = express();
const port = 3000;

// MariaDB 연결 설정
const db_config = {
  host: "218.145.156.138",
  port: 10000,
  user: "root",
  password: "root",
  database: "pi"
};

const db = mysql.createConnection(db_config);

// DB 연결 재시도 로직
function connectDB() {
  db.connect((err) => {
    if (err) {
      console.error('DB 연결 실패:', err.message);
      setTimeout(connectDB, 2000);
      return;
    }
    console.log('DB 연결 성공');

    // 허용 계정 초기화
    const allowedUsers = [
      { username: 'admin', password: '1111' },
      { username: 'mhw0226', password: '1234' },
      { username: 'ju928', password: '1234' },
      { username: 'kyb', password: '1234' },
      { username: 'pjs04', password: '1234' },
      { username: 'acs', password: '1234' }
    ];

    db.query('DELETE FROM users', (err) => {
     

 if (err) console.error('Error deleting existing users:', err.message);
      console.log('Existing users deleted.');
      allowedUsers.forEach(user => {
        db.query('INSERT INTO users (username, password) VALUES (?, ?) ON DUPLICATE KEY UPDATE password = ?', 
          [user.username, user.password, user.password], (err) => {
            if (err) console.error(`Error inserting user ${user.username}:`, err.message);
            else console.log(`User ${user.username} initialized with password ${user.password}.`);
          });
      });
    });

    // check_list 테이블 기본 데이터 초기화
    const defaultChecklists = [
      { name: '3동', columns: JSON.stringify(['점검내용', '결과', '비고', '작성자', '작성일']) },
      { name: '4동', columns: JSON.stringify(['점검내용', '결과', '비고', '작성자', '작성일']) },
      { name: '5동', columns: JSON.stringify(['점검내용', '결과', '비고', '작성자', '작성일']) }
    ];

    // 기본 항목 정의
    const defaultItems = [
      { data: JSON.stringify({ '점검내용': 'A상권 점검', '결과': false, '비고': '', '작성자': '', '작성일': '' }), display_order: 0 },
      { data: JSON.stringify({ '점검내용': 'B상권 점검', '결과': false, '비고': '', '작성자': '', '작성일': '' }), display_order: 1 }
    ];

    defaultChecklists.forEach(checklist => {
      db.query('INSERT INTO check_list (name, columns) VALUES (?, ?) ON DUPLICATE KEY UPDATE columns = ?', 
        [checklist.name, checklist.columns, checklist.columns], (err, result) => {
          if (err) {
            console.error(`Error initializing checklist ${checklist.name}:`, err.message);
          } else {
            console.log(`Checklist ${checklist.name} initialized with columns:`, checklist.columns);
            // 각 체크리스트에 대해 기본 항목 추가
            db.query('SELECT id FROM check_list WHERE name = ?', [checklist.name], (err, results) => {
              if (err) {
                console.error(`Error fetching checklist ID for ${checklist.name}:`, err.message);
                return;
              }
              if (results.length === 0) {
                console.error(`Checklist ${checklist.name} not found after insertion`);
                return;
              }
              const checklistId = results[0].id;
              // 기존 항목 삭제
              db.query('DELETE FROM items WHERE table_id = ?', [checklistId], (err) => {
                if (err) {
                  console.error(`Error deleting existing items for checklist ${checklist.name}:`, err.message);
                  return;
                }
                // 기본 항목 삽입
                defaultItems.forEach(item => {
                  db.query('INSERT INTO items (table_id, data, display_order) VALUES (?, ?, ?)', 
                    [checklistId, item.data, item.display_order], (err) => {
                      if (err) {
                        console.error(`Error inserting item for checklist ${checklist.name}:`, err.message);
                      } else {
                        console.log(`Item initialized for checklist ${checklist.name}:`, item.data);
                      }
                    });
                });
              });
            });
          }
        });
    });

    // 자정마다 결과, 비고, 작성자, 작성일 초기화
    cron.schedule('0 0 * * *', () => {
      console.log('Running midnight reset for 결과, 비고, 작성자, 작성일...');
      db.query(`
        UPDATE items
        SET data = JSON_SET(
          data,
          '$.결과', false,
          '$.비고', '',
          '$.작성자', '',
          '$.작성일', ''
        )
      `, (err) => {
        if (err) {
          console.error('Error resetting fields:', err.message);
        } else {
          console.log('결과, 비고, 작성자, 작성일 reset successfully.');
        }
      });
    }, {
      timezone: 'Asia/Seoul'
    });
  });
}

connectDB();

// 미들웨어 설정
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use(express.json());

// 캐시 방지 미들웨어
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

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
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username });
  if (!username || !password) {
    console.error('Missing username or password:', req.body);
    return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력하세요.' });
  }

  db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
    if (err) {
      console.error('Error during login:', err.message);
      return res.status(500).json({ success: false, message: '서버 오류: ' + err.message });
    }
    console.log('Login query results:', results);
    if (results.length > 0) {
      console.log(`Login successful for user: ${username}`);
      res.json({ success: true });
    } else {
      console.log(`Login failed for user: ${username}`);
      res.json({ success: false, message: '허용되지 않은 계정 또는 잘못된 비밀번호입니다.' });
    }
  });
});

// 체크리스트 목록 조회 API
app.get('/api/checklists', (req, res) => {
  console.log('Received request for /api/checklists');
  db.query('SELECT id, name, columns FROM check_list', (err, results) => {
    if (err) {
      console.error('Error fetching checklists:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch checklists' });
      return;
    }
    console.log('Fetched checklists:', results);
    const parsedResults = results.map(row => ({
      id: row.id,
      name: row.name,
      columns: typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns
    }));
    res.json(parsedResults);
  });
});

// 단일 체크리스트 조회 API
app.get('/api/checklists/:checklistId', (req, res) => {
  const checklistId = req.params.checklistId;
  console.log(`Received request for /api/checklists/${checklistId}`);
  db.query('SELECT id, name, columns FROM check_list WHERE id = ?', [checklistId], (err, results) => {
    if (err) {
      console.error(`Error fetching checklist ${checklistId}:`, err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch checklist' });
      return;
    }
    if (results.length === 0) {
      console.log(`Checklist ${checklistId} not found`);
      res.status(404).json({ success: false, message: 'Checklist not found' });
      return;
    }
    const checklist = results[0];
    console.log(`Fetched checklist ${checklistId}:`, checklist);
    try {
      checklist.columns = typeof checklist.columns === 'string' ? JSON.parse(checklist.columns) : checklist.columns;
      res.json(checklist);
    } catch (e) {
      console.error(`Error parsing columns for checklist ${checklistId}:`, e.message);
      res.status(500).json({ success: false, message: 'Invalid columns format' });
    }
  });
});

// 체크리스트 생성 API
app.post('/api/checklists', (req, res) => {
  const { name, columns } = req.body;
  const defaultColumns = columns || ['점검내용', '결과', '비고', '작성자', '작성일'];
  console.log('Creating checklist:', { name, columns: defaultColumns });
  db.query('INSERT INTO check_list (name, columns) VALUES (?, ?)', [name, JSON.stringify(defaultColumns)], (err, result) => {
    if (err) {
      console.error('Error creating checklist:', err.message);
      res.status(500).json({ success: false, message: 'Failed to create checklist' });
      return;
    }
    console.log('Created checklist:', { id: result.insertId, name, columns: defaultColumns });
    // 새 체크리스트에 기본 항목 추가
    const checklistId = result.insertId;
    const defaultItems = [
      { data: JSON.stringify({ '점검내용': 'A상권 점검', '결과': false, '비고': '', '작성자': '', '작성일': '' }), display_order: 0 },
      { data: JSON.stringify({ '점검내용': 'B상권 점검', '결과': false, '비고': '', '작성자': '', '작성일': '' }), display_order: 1 }
    ];
    defaultItems.forEach(item => {
      db.query('INSERT INTO items (table_id, data, display_order) VALUES (?, ?, ?)', 
        [checklistId, item.data, item.display_order], (err) => {
          if (err) {
            console.error(`Error inserting item for checklist ${name}:`, err.message);
          } else {
            console.log(`Item initialized for checklist ${name}:`, item.data);
          }
        });
    });
    res.json({ success: true, id: result.insertId });
  });
});

// 체크리스트 열 업데이트 API
app.put('/api/checklists/:checklistId/columns', (req, res) => {
  const checklistId = req.params.checklistId;
  const { columns } = req.body;
  if (!columns || !Array.isArray(columns)) {
    res.status(400).json({ success: false, message: 'Columns must be a valid array' });
    return;
  }
  console.log(`Updating columns for checklist ${checklistId}:`, columns);
  db.query('UPDATE check_list SET columns = ? WHERE id = ?', [JSON.stringify(columns), checklistId], (err) => {
    if (err) {
      console.error('Error updating checklist columns:', err.message);
      res.status(500).json({ success: false, message: 'Failed to update columns' });
      return;
    }
    console.log('Updated columns for checklist', checklistId, 'to', columns);
    res.json({ success: true });
  });
});

// 항목 조회 API
app.get('/api/items/:checklistId', (req, res) => {
  const checklistId = req.params.checklistId;
  console.log(`Received request for /api/items/${checklistId}`);
  db.query('SELECT * FROM items WHERE table_id = ? ORDER BY display_order', [checklistId], (err, results) => {
    if (err) {
      console.error('Error fetching items:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch items' });
      return;
    }
    console.log(`Fetched items for checklist ${checklistId}:`, results);
    const parsedResults = results.map(row => ({
      id: row.id,
      table_id: row.table_id,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      display_order: row.display_order
    }));
    res.json(parsedResults);
  });
});

// 항목 추가 API
app.post('/api/items', (req, res) => {
  const { tableId, data, display_order } = req.body;
  console.log('Adding item to checklist', tableId, ':', { data, display_order });
  db.query('SELECT id FROM check_list WHERE id = ?', [tableId], (err, results) => {
    if (err) {
      console.error('Error validating tableId:', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
      return;
    }
    if (results.length === 0) {
      console.error(`Table ID ${tableId} does not exist`);
      res.status(400).json({ success: false, message: 'Invalid tableId' });
      return;
    }
    try {
      const jsonData = JSON.stringify(data);
      db.query('INSERT INTO items (table_id, data, display_order) VALUES (?, ?, ?)', 
        [tableId, jsonData, display_order], (err, result) => {
          if (err) {
            console.error('Error adding item:', err.message);
            res.status(500).json({ success: false, message: 'Failed to add item' });
            return;
          }
          console.log('Added item to checklist', tableId, ':', { id: result.insertId, data, display_order });
          res.json({ success: true, id: result.insertId });
        });
    } catch (e) {
      console.error('Invalid data JSON:', e.message);
      res.status(400).json({ success: false, message: 'Invalid data format' });
    }
  });
});

// 항목 업데이트 API
app.put('/api/items/:id', (req, res) => {
  const itemId = req.params.id;
  const { data } = req.body;
  console.log(`Updating item ${itemId} with data:`, data);
  db.query('SELECT id FROM items WHERE id = ?', [itemId], (err, results) => {
    if (err) {
      console.error('Error checking item existence:', err.message);
      res.status(500).json({ success: false, message: '서버 오류' });
      return;
    }
    if (results.length === 0) {
      console.error(`Item ${itemId} not found`);
      res.status(404).json({ success: false, message: `Item ${itemId} not found` });
      return;
    }
    try {
      const jsonData = JSON.stringify(data);
      db.query('UPDATE items SET data = ? WHERE id = ?', [jsonData, itemId], (err) => {
        if (err) {
          console.error('Error updating item:', err.message);
          res.status(500).json({ success: false, message: 'Failed to update item' });
          return;
        }
        console.log('Updated item', itemId, 'with data:', data);
        res.json({ success: true });
      });
    } catch (e) {
      console.error('Invalid data JSON:', e.message);
      res.status(400).json({ success: false, message: 'Invalid data format' });
    }
  });
});

// 항목 순서 업데이트 API
app.put('/api/items/:checklistId/reorder', (req, res) => {
  const checklistId = req.params.checklistId;
  const { items } = req.body;
  console.log(`Reordering items for checklist ${checklistId}:`, items);
  db.query('SELECT id FROM check_list WHERE id = ?', [checklistId], (err, results) => {
    if (err) {
      console.error('Error validating tableId:', err.message);
      res.status(500).json({ success: false, message: 'Server error' });
      return;
    }
    if (results.length === 0) {
      console.error(`Table ID ${checklistId} does not exist`);
      res.status(400).json({ success: false, message: 'Invalid tableId' });
      return;
    }
    const updates = items.map((item, index) => {
      return new Promise((resolve, reject) => {
        db.query('UPDATE items SET display_order = ? WHERE id = ? AND table_id = ?', 
          [index, item.id, checklistId], (err) => {
            if (err) reject(err);
            else resolve();
          });
      });
    });

    Promise.all(updates)
      .then(() => {
        console.log('Reordered items for checklist', checklistId);
        res.json({ success: true });
      })
      .catch(err => {
        console.error('Error reordering items:', err.message);
        res.status(500).json({ success: false, message: 'Failed to reorder items' });
      });
  });
});

// 체크리스트 스냅샷 저장 API
app.post('/api/snapshots', (req, res) => {
  const { tableId, snapshot_date, columns, items, username, timestamp } = req.body;
  console.log('Received snapshot data:', { tableId, snapshot_date, columns, items, username, timestamp });
  if (!tableId || !snapshot_date || !columns || !items || !username || !timestamp) {
    console.error('Missing required fields for snapshot:', req.body);
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  db.query('SELECT id FROM check_list WHERE id = ?', [tableId], (err, results) => {
    if (err) {
      console.error('Error validating tableId:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to validate tableId' });
    }
    if (results.length === 0) {
      console.error(`Table ID ${tableId} does not exist`);
      return res.status(400).json({ success: false, message: 'Invalid tableId' });
    }

    try {
      const columnsJson = JSON.stringify(columns);
      const itemsJson = JSON.stringify(items);
      console.log('Saving snapshot for table', tableId, 'on', snapshot_date, 'by', username);
      db.query(
        'INSERT INTO checklist_snapshots (table_id, snapshot_date, columns, items, username, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
        [tableId, snapshot_date, columnsJson, itemsJson, username, timestamp],
        (err, result) => {
          if (err) {
            console.error('Error saving snapshot:', err.message);
            return res.status(500).json({ success: false, message: 'Failed to save snapshot', error: err.message });
          }
          console.log('Saved snapshot:', { id: result.insertId, tableId, snapshot_date });
          res.json({ success: true, id: result.insertId });
        }
      );
    } catch (e) {
      console.error('Invalid JSON format:', e.message);
      return res.status(400).json({ success: false, message: 'Invalid JSON format' });
    }
  });
});

// 스냅샷 조회 API (수정된 부분)
app.get('/api/snapshots', (req, res) => {
  const { date, tableId } = req.query;
  console.log('Query parameters:', { date, tableId });
  if (!date || !tableId) {
    console.error('Missing date or tableId:', req.query);
    return res.status(400).json({ success: false, message: 'Missing date or tableId' });
  }
  console.log(`Fetching snapshot for date ${date} and table ${tableId}`);
  db.query(
    'SELECT columns, items FROM checklist_snapshots WHERE snapshot_date LIKE ? AND table_id = ? ORDER BY timestamp DESC LIMIT 1',
    [`${date}%`, tableId],
    (err, results) => {
      if (err) {
        console.error('Database error fetching snapshot:', err.message, err.stack);
        return res.status(500).json({ success: false, message: 'Database error', error: err.message });
      }
      if (results.length > 0) {
        const rawData = results[0];
        console.log('Raw snapshot data from DB:', { rawColumns: rawData.columns, rawItems: rawData.items });
        try {
          const columns = typeof rawData.columns === 'string' ? JSON.parse(rawData.columns) : rawData.columns;
          const items = typeof rawData.items === 'string' ? JSON.parse(rawData.items) : rawData.items;
          if (!Array.isArray(columns) || !Array.isArray(items)) {
            throw new Error('Invalid array structure');
          }
          console.log('Parsed snapshot data:', { columns, items });
          return res.json({ columns, items });
        } catch (e) {
          console.error(`Error parsing snapshot data for date ${date} and table ${tableId}:`, e.message);
          return res.status(500).json({ success: false, message: 'Invalid snapshot data format', rawColumns: rawData.columns, rawItems: rawData.items });
        }
      }
      // 스냅샷이 없는 경우 현재 items 테이블에서 데이터 가져오기
      console.log(`No snapshot found for date ${date} and table ${tableId}, fetching current items`);
      db.query('SELECT id, data, display_order FROM items WHERE table_id = ? ORDER BY display_order', [tableId], (err, itemResults) => {
        if (err) {
          console.error('Error fetching items:', err.message);
          return res.status(500).json({ success: false, message: 'Failed to fetch items' });
        }
        db.query('SELECT columns FROM check_list WHERE id = ?', [tableId], (err, checklistResults) => {
          if (err || checklistResults.length === 0) {
            console.error('Error fetching checklist columns:', err ? err.message : 'Checklist not found');
            return res.status(500).json({ success: false, message: 'Failed to fetch checklist columns' });
          }
          try {
            const columns = typeof checklistResults[0].columns === 'string' ? JSON.parse(checklistResults[0].columns) : checklistResults[0].columns;
            const items = itemResults.map(row => ({
              id: row.id,
              data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
              display_order: row.display_order
            }));
            console.log('Returning current data for date:', { columns, items });
            res.json({ columns, items });
          } catch (e) {
            console.error('Error parsing items or columns:', e.message);
            res.status(500).json({ success: false, message: 'Invalid data format' });
          }
        });
      });
    }
  );
});

// 서버 시작
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});