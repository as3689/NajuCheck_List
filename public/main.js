let currentTableName = null;
let currentTableId = null;

// 입력값 저장을 위한 디바운스 함수
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 텍스트 길이에 따라 폰트 크기 조정
function adjustFontSize(textarea) {
  const textLength = textarea.value.length;
  if (textLength > 50) {
    textarea.classList.remove('font-large');
    textarea.classList.add('font-small');
  } else {
    textarea.classList.remove('font-small');
    textarea.classList.add('font-large');
  }
}

async function createTable(name) {
  console.log(`Creating table: ${name}`);
  const columns = ['점검내용', '결과', '비고', '작성자', '작성일', '사진'];
  try {
    const response = await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, columns })
    });
    const result = await response.json();
    if (result.success) {
      console.log(`Table created: ${name}, ID: ${result.id}`);
      return result.id;
    } else {
      console.error('Failed to create checklist:', result.message || 'Unknown error');
      alert('체크리스트 생성에 실패했습니다.');
      return null;
    }
  } catch (error) {
    console.error('Error creating table:', error.message);
    alert('체크리스트 생성 중 오류가 발생했습니다: ' + error.message);
    return null;
  }
}

function showItemModal(checklistId, columns) {
  console.log('Opening item modal for checklistId:', checklistId);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>새 항목 추가</h3>
      <input type="text" id="itemNameInput" placeholder="점검내용 입력 (예: 추가 점검)" />
      <div class="modal-buttons">
        <button id="modalConfirmBtn">추가</button>
        <button id="modalCancelBtn">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const confirmBtn = document.getElementById('modalConfirmBtn');
  const cancelBtn = document.getElementById('modalCancelBtn');
  const input = document.getElementById('itemNameInput');

  confirmBtn.onclick = async () => {
    const itemName = input.value.trim();
    if (itemName) {
      const newData = {};
      columns.forEach(col => {
        if (col === '점검내용') newData[col] = itemName;
        else if (col === '결과') newData[col] = false;
        else newData[col] = '';
      });
      console.log(`Adding item to checklist ${checklistId}:`, newData);
      try {
        const response = await fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId: checklistId, data: newData, display_order: 0 })
        });
        const result = await response.json();
        if (result.success) {
          showTable(currentTableName);
        } else {
          console.error('Failed to add item:', result.message);
          alert('항목 추가에 실패했습니다: ' + result.message);
        }
      } catch (error) {
        console.error('Error adding item:', error.message);
        alert('항목 추가 중 오류가 발생했습니다: ' + error.message);
      }
    }
    document.body.removeChild(modal);
  };

  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };
}

function showPhotoModal(itemId, photoUrl) {
  console.log(`Opening photo modal for item ${itemId}, photoUrl: ${photoUrl}`);
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content photo-modal">
      <h3>사진 보기</h3>
      <img src="${photoUrl}" class="modal-photo" style="max-width: 100%; max-height: 400px;" />
      <div class="modal-buttons">
        <button id="deletePhotoBtn">사진 삭제</button>
        <button id="modalCloseBtn">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const deleteBtn = document.getElementById('deletePhotoBtn');
  const closeBtn = document.getElementById('modalCloseBtn');

  deleteBtn.onclick = async () => {
    if (confirm('이 사진을 삭제하시겠습니까?')) {
      console.log(`Deleting photo for item ${itemId}`);
      try {
        const response = await fetch(`/api/photos/${itemId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
          console.log(`Photo deleted for item ${itemId}`);
          showTable(currentTableName);
          document.body.removeChild(modal);
        } else {
          console.error('Failed to delete photo:', result.message);
          alert('사진 삭제에 실패했습니다: ' + result.message);
        }
      } catch (error) {
        console.error('Error deleting photo:', error.message);
        alert('사진 삭제 중 오류가 발생했습니다: ' + error.message);
      }
    }
  };

  closeBtn.onclick = () => {
    document.body.removeChild(modal);
  };
}

function showCalendarModal() {
  console.log('Opening calendar modal');
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>날짜 선택</h3>
      <div class="calendar" id="calendar">
        <div class="calendar-header">
          <button class="calendar-nav" id="prev-month"><</button>
          <span id="calendar-title"></span>
          <button class="calendar-nav" id="next-month">></button>
        </div>
        <div class="calendar-body" id="calendar-body"></div>
      </div>
      <div class="modal-buttons">
        <button id="modalCancelBtn">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const cancelBtn = document.getElementById('modalCancelBtn');
  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };

  let currentDate = new Date();
  renderCalendar(currentDate);

  document.getElementById('prev-month').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
  };

  document.getElementById('next-month').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
  };

  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const title = document.getElementById('calendar-title');
    title.textContent = `${year}년 ${month + 1}월`;

    const calendarBody = document.getElementById('calendar-body');
    calendarBody.innerHTML = '';

    const days = ['일', '월', '화', '수', '목', '금', '토'];
    days.forEach(day => {
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';
      dayEl.textContent = day;
      calendarBody.appendChild(dayEl);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.className = 'calendar-day empty';
      calendarBody.appendChild(emptyDay);
    }

    for (let i = 1; i <= lastDate; i++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';
      dayEl.textContent = i;
      dayEl.onclick = () => {
        const selectedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        console.log(`Selected date: ${selectedDate}`);
        loadTableByDate(selectedDate);
        document.body.removeChild(modal);
      };
      calendarBody.appendChild(dayEl);
    }
  }
}

async function loadTableByDate(date) {
  console.log(`Loading table for date: ${date}, tableId: ${currentTableId}`);
  if (!date) {
    console.log('No date provided, showing current table');
    showTable(currentTableName);
    return;
  }
  if (!currentTableId) {
    console.error('currentTableId is not set');
    alert('체크리스트 ID가 설정되지 않았습니다. 동을 선택해 주세요.');
    return;
  }
  try {
    const response = await fetch(`/api/snapshots?date=${date}&tableId=${currentTableId}`);
    console.log(`Response status: ${response.status}, URL: /api/snapshots?date=${date}&tableId=${currentTableId}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'No error details' }));
      console.error('Failed to load snapshot:', response.status, response.statusText, errorData);
      alert(`스냅샷 데이터를 로드하지 못했습니다: ${errorData.message || response.statusText}`);
      showTable(currentTableName);
      return;
    }
    const snapshot = await response.json();
    console.log('Snapshot data:', JSON.stringify(snapshot, null, 2));
    if (!snapshot || !snapshot.columns || !snapshot.items || !Array.isArray(snapshot.columns) || !Array.isArray(snapshot.items)) {
      console.error('Invalid snapshot data structure:', snapshot);
      alert(`유효하지 않은 스냅샷 데이터입니다.`);
      return;
    }

    const container = document.getElementById('tables-container');
    if (!container) {
      console.error('Error: tables-container element not found in the DOM.');
      alert('테이블 컨테이너를 찾을 수 없습니다.');
      return;
    }

    container.innerHTML = '';

    const tableDiv = document.createElement('div');
    tableDiv.className = 'table-view';
    tableDiv.innerHTML = `<h2>${currentTableName} (${date})</h2>`;

    const tableElement = document.createElement('table');
    tableElement.setAttribute('draggable', 'true');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    snapshot.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    tableElement.appendChild(thead);

    const tbody = document.createElement('tbody');
    snapshot.items.forEach(item => {
      const row = document.createElement('tr');
      row.dataset.id = item.id;
      const data = item.data;
      snapshot.columns.forEach(col => {
        const td = document.createElement('td');
        if (col === '결과') {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'checklist-checkbox';
          checkbox.checked = data[col] === true;
          checkbox.disabled = true; // 과거 데이터는 수정 불가
          td.appendChild(checkbox);
        } else if (col === '사진') {
          if (item.photo_url) {
            const icon = document.createElement('i');
            icon.className = 'fas fa-image photo-icon';
            icon.title = '사진 보기';
            icon.onclick = () => showPhotoModal(item.id, item.photo_url);
            td.appendChild(icon);
          } else {
            td.textContent = '없음';
          }
        } else {
          const textarea = document.createElement('textarea');
          textarea.className = 'checklist-textarea';
          textarea.value = data[col] || '';
          textarea.readOnly = true; // 과거 데이터는 수정 불가
          adjustFontSize(textarea);
          td.appendChild(textarea);
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });

    tableElement.appendChild(tbody);
    tableDiv.appendChild(tableElement);
    container.appendChild(tableDiv);
  } catch (error) {
    console.error('Error in loadTableByDate:', error.message, error.stack);
    alert('스냅샷 로드 중 오류가 발생했습니다: ' + error.message);
  }
}

async function saveChecklist() {
  const username = localStorage.getItem('username');
  console.log(`Saving checklist: tableId=${currentTableId}, username=${username}`);
  if (!currentTableId || !username) {
    console.error('Missing currentTableId or username:', { currentTableId, username });
    alert('체크리스트를 저장할 수 없습니다. 다시 로그인하거나 동을 선택해 주세요.');
    return;
  }

  try {
    const checklistResponse = await fetch(`/api/checklists/${currentTableId}`);
    console.log(`Checklist response status: ${checklistResponse.status}, url: /api/checklists/${currentTableId}`);
    if (!checklistResponse.ok) {
      console.error('Failed to fetch checklist:', checklistResponse.status, checklistResponse.statusText);
      alert('체크리스트 데이터를 가져오지 못했습니다.');
      return;
    }
    const checklist = await checklistResponse.json();
    console.log('Checklist data:', checklist);
    if (!checklist || !checklist.id || !checklist.columns) {
      console.error('Invalid checklist data:', checklist);
      alert('유효하지 않은 체크리스트 데이터입니다.');
      return;
    }

    const itemsResponse = await fetch(`/api/items/${currentTableId}`);
    console.log(`Items response status: ${itemsResponse.status}, url: /api/items/${currentTableId}`);
    if (!itemsResponse.ok) {
      console.error('Failed to fetch items:', itemsResponse.status, itemsResponse.statusText);
      alert('항목 데이터를 가져오지 못했습니다.');
      return;
    }
    const items = await itemsResponse.json();
    console.log('Items data:', JSON.stringify(items, null, 2));

    const validItems = items.map(item => ({
      id: item.id,
      data: {
        점검내용: String(item.data.점검내용 || ''),
        결과: item.data.결과 === true || item.data.결과 === false ? item.data.결과 : false,
        비고: String(item.data.비고 || ''),
        작성자: String(item.data.작성자 || ''),
        작성일: String(item.data.작성일 || ''),
        사진: item.photo_url || ''
      },
      display_order: item.display_order,
      photo_url: item.photo_url
    }));
    console.log('Validated items:', JSON.stringify(validItems, null, 2));

    const snapshotDate = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toLocaleString('ko-KR', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\. /g, '-').replace(/오전|오후/, '').trim();

    const snapshotData = {
      tableId: currentTableId,
      snapshot_date: snapshotDate,
      columns: checklist.columns,
      items: validItems,
      username,
      timestamp
    };
    console.log('Saving snapshot:', JSON.stringify(snapshotData, null, 2));

    const response = await fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotData)
    });
    const result = await response.json();
    console.log('Save snapshot result:', result);
    if (result.success) {
      alert('체크리스트가 성공적으로 저장되었습니다.');
    } else {
      console.error('Failed to save snapshot:', result.message, result.error);
      alert(`체크리스트 저장에 실패했습니다: ${result.message || '알 수 없는 오류'}`);
    }
  } catch (error) {
    console.error('Error in saveChecklist:', error.message, error.stack);
    alert(`체크리스트 저장 중 오류가 발생했습니다: ${error.message}`);
  }
}

async function showTable(name) {
  console.log('showTable called with name:', name);
  currentTableName = name;
  console.log('Fetching /api/checklists...');
  try {
    const response = await fetch('/api/checklists');
    console.log('Fetch response:', response);
    if (!response.ok) {
      console.error('Failed to fetch checklists:', response.status, response.statusText);
      alert('체크리스트 목록을 가져오지 못했습니다.');
      return;
    }
    let checklists = await response.json();
    console.log('Checklists received:', checklists);
    if (!checklists) {
      console.error('Checklists response is empty');
      alert('체크리스트 데이터가 없습니다.');
      return;
    }

    let checklist = checklists.find(t => t.name === name);

    if (!checklist) {
      const newTableId = await createTable(name);
      if (!newTableId) {
        console.error('Failed to create checklist');
        alert('체크리스트 생성에 실패했습니다.');
        return;
      }
      const updatedResponse = await fetch('/api/checklists');
      if (!updatedResponse.ok) {
        console.error('Failed to fetch updated checklists:', updatedResponse.status, updatedResponse.statusText);
        alert('업데이트된 체크리스트 목록을 가져오지 못했습니다.');
        return;
      }
      checklists = await updatedResponse.json();
      checklist = checklists.find(t => t.name === name);
      if (!checklist) {
        console.error('Failed to fetch newly created checklist');
        alert('새로 생성된 체크리스트를 가져오지 못했습니다.');
        return;
      }
    }

    currentTableId = checklist.id;
    console.log(`Set currentTableId: ${currentTableId}, currentTableName: ${currentTableName}`);

    const container = document.getElementById('tables-container');
    if (!container) {
      console.error('Error: tables-container element not found in the DOM.');
      alert('테이블 컨테이너를 찾을 수 없습니다.');
      return;
    }

    container.innerHTML = '';

    const tableDiv = document.createElement('div');
    tableDiv.className = 'table-view';
    tableDiv.innerHTML = `<h2>${checklist.name}</h2>`;

    const tableElement = document.createElement('table');
    tableElement.setAttribute('draggable', 'true');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const columns = checklist.columns;
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    tableElement.appendChild(thead);

    const tbody = document.createElement('tbody');
    const itemsResponse = await fetch(`/api/items/${checklist.id}`);
    if (!itemsResponse.ok) {
      console.error('Failed to fetch items:', itemsResponse.status, itemsResponse.statusText);
      alert('항목 데이터를 가져오지 못했습니다.');
      return;
    }
    let items = await itemsResponse.json();
    console.log('Items:', items);

    items.forEach(item => {
      const row = document.createElement('tr');
      row.setAttribute('draggable', 'true');
      row.dataset.id = item.id;
      const data = item.data;
      columns.forEach(col => {
        const td = document.createElement('td');
        if (col === '결과') {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'checklist-checkbox';
          checkbox.checked = data[col] === true;
          checkbox.addEventListener('change', debounce(async () => {
            data['결과'] = checkbox.checked;
            data['작성자'] = localStorage.getItem('username') || '';
            data['작성일'] = new Date().toLocaleString('ko-KR', {
              year: '2-digit',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            }).replace(/\. /g, '-').replace(/오전|오후/g, '').trim();
            console.log(`Updating data for item ${item.id}:`, data);
            try {
              const response = await fetch(`/api/items/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, display_order: item.display_order })
              });
              const result = await response.json();
              if (!result.success) {
                console.error(`Failed to update item ${item.id}:`, result.message);
                alert('입력값 업데이트에 실패했습니다: ' + result.message);
              } else {
                const rowCells = row.querySelectorAll('td');
                rowCells[3].querySelector('textarea').value = data['작성자'];
                rowCells[4].querySelector('textarea').value = data['작성일'];
              }
            } catch (error) {
              console.error('Error updating item:', error.message);
              alert('입력값 업데이트 중 오류가 발생했습니다: ' + error.message);
            }
          }, 500));
          td.appendChild(checkbox);
        } else if (col === '사진') {
          if (item.photo_url) {
            const icon = document.createElement('i');
            icon.className = 'fas fa-image photo-icon';
            icon.title = '사진 보기';
            icon.onclick = () => showPhotoModal(item.id, item.photo_url);
            td.appendChild(icon);
          } else {
            const uploadBtn = document.createElement('button');
            uploadBtn.textContent = '+';
            uploadBtn.className = 'upload-photo-btn';
            uploadBtn.onclick = () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('photo', file);
                formData.append('itemId', item.id);
                console.log(`Uploading photo for item ${item.id}`);
                try {
                  const response = await fetch('/api/upload-photo', {
                    method: 'POST',
                    body: formData
                  });
                  const result = await response.json();
                  if (result.success) {
                    console.log(`Photo uploaded: ${result.photoUrl}`);
                    showTable(currentTableName);
                  } else {
                    console.error('Failed to upload photo:', result.message);
                    alert('사진 업로드에 실패했습니다: ' + result.message);
                  }
                } catch (error) {
                  console.error('Error uploading photo:', error.message);
                  alert('사진 업로드 중 오류가 발생했습니다: ' + error.message);
                }
              };
              input.click();
            };
            td.appendChild(uploadBtn);
          }
        } else {
          const textarea = document.createElement('textarea');
          textarea.className = 'checklist-textarea';
          textarea.value = data[col] || '';
          textarea.readOnly = col === '작성자' || col === '작성일';
          if (!textarea.readOnly) {
            textarea.addEventListener('input', debounce(async () => {
              data[col] = textarea.value;
              adjustFontSize(textarea);
              console.log(`Updating item ${item.id} with data:`, data);
              try {
                const response = await fetch(`/api/items/${item.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ data, display_order: item.display_order })
                });
                const result = await response.json();
                if (!result.success) {
                  console.error(`Failed to update item ${item.id}:`, result.message);
                  alert('입력값 업데이트에 실패했습니다: ' + result.message);
                }
              } catch (error) {
                console.error('Error updating item:', error.message);
                alert('입력값 업데이트 중 오류가 발생했습니다: ' + error.message);
              }
            }, 500));
          }
          adjustFontSize(textarea);
          td.appendChild(textarea);
        }
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });

    const addButtonRow = document.createElement('tr');
    const addButtonCell = document.createElement('td');
    addButtonCell.colSpan = columns.length;
    addButtonCell.style.textAlign = 'center';
    const addButton = document.createElement('button');
    addButton.textContent = '항목 추가';
    addButton.onclick = () => showItemModal(checklist.id, columns);
    addButtonCell.appendChild(addButton);
    addButtonRow.appendChild(addButtonCell);
    tbody.appendChild(addButtonRow);

    tableElement.appendChild(tbody);
    tableDiv.appendChild(tableElement);
    container.appendChild(tableDiv);

    // 드래그 및 터치 이벤트 추가
    const rows = tbody.querySelectorAll('tr:not(:last-child)');
    rows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', row.dataset.id);
        row.classList.add('dragging');
        console.log(`Drag started for row ${row.dataset.id}`);
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        console.log(`Drag ended for row ${row.dataset.id}`);
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingRow = tbody.querySelector('.dragging');
        const afterElement = getDragAfterElement(tbody, e.clientY);
        if (afterElement == null || afterElement === addButtonRow) {
          tbody.insertBefore(draggingRow, addButtonRow);
        } else {
          tbody.insertBefore(draggingRow, afterElement);
        }
      });

      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        const updatedRows = Array.from(tbody.querySelectorAll('tr:not(:last-child)'));
        const updatedItems = updatedRows.map((row, index) => ({
          id: parseInt(row.dataset.id),
          display_order: index
        }));
        console.log(`Reordering items for checklist ${checklist.id}:`, updatedItems);
        try {
          const response = await fetch(`/api/items/${checklist.id}/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: updatedItems })
          });
          const result = await response.json();
          if (!result.success) {
            console.error('Failed to reorder items:', result.message);
            alert('항목 순서 변경에 실패했습니다: ' + (result.message || '알 수 없는 오류'));
          } else {
            console.log('Items reordered successfully');
          }
        } catch (error) {
          console.error('Error reordering items:', error.message);
          alert('항목 순서 변경 중 오류가 발생했습니다: ' + error.message);
        }
      });

      let touchStartY = 0;
      let draggingRow = null;

      row.addEventListener('touchstart', (e) => {
        draggingRow = row;
        row.classList.add('dragging');
        touchStartY = e.touches[0].clientY;
        console.log(`Touch started for row ${row.dataset.id}`);
      });

      row.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touchY = e.touches[0].clientY;
        const afterElement = getDragAfterElement(tbody, touchY);
        if (afterElement == null || afterElement === addButtonRow) {
          tbody.insertBefore(draggingRow, addButtonRow);
        } else {
          tbody.insertBefore(draggingRow, afterElement);
        }
      });

      row.addEventListener('touchend', async () => {
        row.classList.remove('dragging');
        console.log(`Touch ended for row ${row.dataset.id}`);
        const updatedRows = Array.from(tbody.querySelectorAll('tr:not(:last-child)'));
        const updatedItems = updatedRows.map((row, index) => ({
          id: parseInt(row.dataset.id),
          display_order: index
        }));
        console.log(`Reordering items for checklist ${checklist.id}:`, updatedItems);
        try {
          const response = await fetch(`/api/items/${checklist.id}/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: updatedItems })
          });
          const result = await response.json();
          if (!result.success) {
            console.error('Failed to reorder items:', result.message);
            alert('항목 순서 변경에 실패했습니다: ' + (result.message || '알 수 없는 오류'));
          } else {
            console.log('Items reordered successfully');
          }
        } catch (error) {
          console.error('Error reordering items:', error.message);
          alert('항목 순서 변경 중 오류가 발생했습니다: ' + error.message);
        }
        draggingRow = null;
      });
    });
  } catch (error) {
    console.error('Error in showTable:', error.message, error.stack);
    alert('체크리스트 로드 중 오류가 발생했습니다: ' + error.message);
  }
}

function getDragAfterElement(tbody, y) {
  const draggableElements = [...tbody.querySelectorAll('tr:not(.dragging):not(:last-child)')];
  return draggableElements.reduce((closest, element) => {
    const box = element.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: element };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const content = document.querySelector('.content');
  const header = document.querySelector('.header');
  sidebar.classList.remove('collapsed');
  content.classList.remove('shifted');
  header.classList.remove('shifted');
}

function hideSidebar() {
  const sidebar = document.getElementById('sidebar');
  const content = document.querySelector('.content');
  const header = document.querySelector('.header');
  sidebar.classList.add('collapsed');
  content.classList.add('shifted');
  header.classList.add('shifted');
}

function addDong() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>새 동 추가</h3>
      <input type="text" id="dongNameInput" placeholder="동 이름을 입력하세요 (예: 6동)" />
      <div class="modal-buttons">
        <button id="modalConfirmBtn">확인</button>
        <button id="modalCancelBtn">취소</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const confirmBtn = document.getElementById('modalConfirmBtn');
  const cancelBtn = document.getElementById('modalCancelBtn');
  const input = document.getElementById('dongNameInput');

  confirmBtn.onclick = async () => {
    const dongName = input.value.trim();
    if (dongName) {
      const dongButtons = document.getElementById('dong-buttons');
      const newButton = document.createElement('button');
      newButton.textContent = dongName;
      newButton.onclick = () => showTable(dongName);
      dongButtons.appendChild(newButton);
      currentTableName = dongName;
      await showTable(dongName);
    }
    document.body.removeChild(modal);
  };

  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };
}

function logout() {
  console.log('Logging out...');
  localStorage.removeItem('username');
  console.log('Username removed from localStorage:', localStorage.getItem('username'));
  try {
    window.location.replace('/');
    console.log('Redirecting to login page...');
  } catch (e) {
    console.error('Failed to redirect to login page:', e.message);
    alert('로그아웃 후 페이지 이동에 실패했습니다.');
  }
}

// 오늘 날짜로 이동
function goToToday() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Going to today: ${today}`);
  if (currentTableId) {
    showTable(currentTableName);
  } else {
    console.error('currentTableId is not set');
    alert('동을 선택해 주세요.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('Current path:', window.location.pathname);
  if (window.location.pathname.includes('/main')) {
    const username = localStorage.getItem('username');
    console.log('Username in localStorage:', username);
    if (!username) {
      console.log('No username found, redirecting to login...');
      window.location.replace('/');
    } else {
      document.getElementById('username-display').textContent = `${username} | `;
      document.getElementById('date-time').textContent = new Date().toLocaleString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\. /g, '-').replace(/오전|오후/, '').trim();
      showTable('3동');
    }
  } else {
    console.log('Not /main path, skipping login check.');
  }
});