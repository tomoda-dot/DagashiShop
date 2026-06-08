// ═══════════════════════════════════════════════════════
// supabase-adapter.js — GAS互換アダプター
// google.script.run.XXX() を Supabase REST API に変換
// ═══════════════════════════════════════════════════════

// ── REST ヘルパー ─────────────────────────────────────

function sbFetch(path, opts) {
  opts = opts || {};
  var url = SUPABASE_URL + '/rest/v1/' + path;
  var headers = {
    'apikey':        SUPABASE_ANON,
    'Authorization': 'Bearer ' + SUPABASE_ANON,
    'Content-Type':  'application/json',
    'Prefer':        opts.prefer || 'return=representation'
  };
  return fetch(url, {
    method:  opts.method  || 'GET',
    headers: headers,
    body:    opts.body    || undefined
  }).then(function(r) {
    if (r.status === 204) return null;
    return r.json().then(function(d) {
      if (!r.ok) throw new Error(JSON.stringify(d));
      return d;
    });
  });
}

function sbGet(table, query)   { return sbFetch(table + (query ? '?' + query : '')); }
function sbPost(table, body)   { return sbFetch(table, { method:'POST', body:JSON.stringify(body) }); }
function sbPatch(table, query, body) {
  return sbFetch(table + '?' + query, { method:'PATCH', body:JSON.stringify(body), prefer:'return=representation' });
}
function sbDelete(table, query){ return sbFetch(table + '?' + query, { method:'DELETE', prefer:'' }); }

// ── JST日付ユーティリティ ─────────────────────────────

function todayJST() {
  var d = new Date();
  var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

function nowJST() {
  var d = new Date();
  var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

// ── run1 / run2 互換 ──────────────────────────────────
// Page.html の run1('funcName', arg) / run2('funcName', a, b) を
// そのまま置き換えられるよう同名インターフェースを提供

function run1(fn, a) {
  return GAS[fn](a);
}
function run2(fn, a, b) {
  return GAS[fn](a, b);
}

// google.script.run 互換オブジェクト（admin.html / regi.html用）
var gas_successHandler = null;
var gas_failureHandler = function(e) { console.error('GAS error:', e); };

// ── GasProxy クラス定義 ──────────────────────────────
function GasProxy() {
  this._success = null;
  this._failure = function(e) { console.error(e); };
}
GasProxy.prototype.withSuccessHandler = function(fn) {
  this._success = fn; return this;
};
GasProxy.prototype.withFailureHandler = function(fn) {
  this._failure = fn; return this;
};
(function() {
  var fns = [
    'getAllData','updateProduct','addProduct','updateStock',
    'addRestock','applyRestock','saveImageData','updateImg',
    'saveSortOrder','getSuppliers','addSupplier','updateSupplier',
    'deleteSupplier','getOrders','saveOrder','deleteOrder',
    'receiveOrderItem','sendFaxEmail','getSettings','saveSettings',
    'saveRegiDefaults','getTodaySalesData','saveOrderFromRegi',
    'getSummaryData','saveClosingData','getDetailByDate',
    'invalidateDetailRow','updateDetailRow','getSavingsData',
    'addSavingsRow','testConnection'
  ];
  fns.forEach(function(name) {
    GasProxy.prototype[name] = function(arg1, arg2) {
      var self = this;
      GAS[name](arg1, arg2)
        .then(function(res) { if (self._success) self._success(res); })
        .catch(function(e)  { if (self._failure) self._failure(e);  });
    };
  });
})();

// google.script.run 互換オブジェクト
// google.script.run.withSuccessHandler(fn).someFunc(arg) の形で使える
var google = {
  script: {
    get run() { return new GasProxy(); }
  }
};

// ── GAS関数の実体（全て Promise を返す） ─────────────

var GAS = {};

// ─ testConnection ─
GAS.testConnection = function() {
  return Promise.resolve({ ok: true, message: 'Supabase接続OK' });
};

// ─ getAllData ─
GAS.getAllData = function() {
  return Promise.all([
    sbGet('products', 'select=id,name,cat,stock,min,price,unit,exp,buy_price,buy_qty,memo,status,sort_order&order=sort_order.asc,id.asc'),
    sbGet('restock',  'select=*&order=id.desc')
  ]).then(function(results) {
    var products = (results[0] || []).map(function(p) {
      return {
        id:        p.id,
        name:      p.name      || '',
        cat:       p.cat       || 'その他',
        stock:     p.stock     || 0,
        min:       p.min       || 5,
        price:     p.price     || 0,
        unit:      p.unit      || '個',
        exp:       p.exp       || '',
        img:       p.img       || null,
        buy_price: p.buy_price || 0,
        buy_qty:   p.buy_qty   || 0,
        memo:      p.memo      || '',
        status:    p.status    || 'active'
      };
    });
    var restock = (results[1] || []).map(function(r) {
      return {
        id:         r.id,
        nm:         r.nm         || '',
        iri:        r.iri        || 0,
        price:      r.buy_price  || 0,
        tanka:      r.tanka      || 0,
        sell:       r.sell       || 0,
        d:          r.d          || '',
        status:     r.status     || 'done',
        productId:  r.product_id || 0,
        applied_at: r.applied_at || ''
      };
    });
    return { products: products, restock: restock };
  });
};

// ─ updateProduct ─
GAS.updateProduct = function(p) {
  var body = {};
  if (p.name      !== undefined) body.name      = p.name;
  if (p.cat       !== undefined) body.cat        = p.cat;
  if (p.min       !== undefined) body.min        = Number(p.min);
  if (p.price     !== undefined) body.price      = Number(p.price);
  if (p.unit      !== undefined) body.unit       = p.unit;
  if (p.exp       !== undefined) body.exp        = p.exp || null;
  if (p.buy_price !== undefined) body.buy_price  = Number(p.buy_price);
  if (p.buy_qty   !== undefined) body.buy_qty    = Number(p.buy_qty);
  if (p.memo      !== undefined) body.memo       = p.memo;
  if (p.status    !== undefined) body.status     = p.status;
  return sbPatch('products', 'id=eq.' + p.id, body)
    .then(function() { return { ok: true }; });
};

// ─ addProduct ─
GAS.addProduct = function(p) {
  var body = {
    name:      p.name      || '',
    cat:       p.cat       || 'その他',
    stock:     Number(p.stock)     || 0,
    min:       Number(p.min)       || 5,
    price:     Number(p.price)     || 0,
    unit:      p.unit      || '個',
    exp:       p.exp       || null,
    buy_price: Number(p.buy_price) || 0,
    buy_qty:   Number(p.buy_qty)   || 0,
    memo:      p.memo      || '',
    status:    p.status    || 'active',
    sort_order: 9999
  };
  return sbPost('products', body).then(function(res) {
    var row = Array.isArray(res) ? res[0] : res;
    return { ok: true, id: row.id };
  });
};

// ─ updateStock ─
GAS.updateStock = function(id, stock) {
  return sbPatch('products', 'id=eq.' + id, { stock: Number(stock) })
    .then(function() { return { ok: true }; });
};

// ─ addRestock ─
GAS.addRestock = function(r) {
  // 商品情報を更新
  var pUpdate = {};
  if (r.buy_price) pUpdate.buy_price = Number(r.buy_price);
  if (r.buy_qty)   pUpdate.buy_qty   = Number(r.buy_qty);
  if (r.sell)      pUpdate.price     = Number(r.sell);

  var p1 = Object.keys(pUpdate).length > 0
    ? sbPatch('products', 'id=eq.' + r.productId, pUpdate)
    : Promise.resolve();

  // candidate → active 昇格チェック
  var p2 = sbGet('products', 'id=eq.' + r.productId + '&select=status')
    .then(function(rows) {
      if (rows && rows[0] && rows[0].status === 'candidate') {
        return sbPatch('products', 'id=eq.' + r.productId, { status: 'active' });
      }
    });

  // 仕入れ履歴追加
  var restockBody = {
    product_id: Number(r.productId),
    nm:         r.nm        || '',
    iri:        Number(r.iri)       || 0,
    buy_price:  Number(r.buy_price) || 0,
    tanka:      Number(r.tanka)     || 0,
    sell:       Number(r.sell)      || 0,
    d:          r.d || todayJST(),
    status:     'pending'
  };

  return Promise.all([p1, p2])
    .then(function() { return sbPost('restock', restockBody); })
    .then(function() { return { ok: true }; });
};

// ─ applyRestock ─
GAS.applyRestock = function(restockId) {
  return sbGet('restock', 'id=eq.' + restockId + '&select=*')
    .then(function(rows) {
      if (!rows || !rows[0]) throw new Error('仕入れ履歴が見つかりません');
      var r = rows[0];
      // 在庫加算
      return sbGet('products', 'id=eq.' + r.product_id + '&select=stock,status')
        .then(function(prows) {
          var p = prows && prows[0];
          if (!p) throw new Error('商品が見つかりません');
          var newStock  = (p.stock || 0) + (r.iri || 0);
          var pUpdate   = { stock: newStock };
          if (p.status === 'hidden' || p.status === 'candidate') pUpdate.status = 'active';
          return sbPatch('products', 'id=eq.' + r.product_id, pUpdate);
        })
        .then(function() {
          return sbPatch('restock', 'id=eq.' + restockId, {
            status:     'done',
            applied_at: nowJST()
          });
        })
        .then(function() { return { ok: true }; });
    });
};



// ─ getProductImgs（バッチ取得・ページ単位） ─
GAS.getProductImgsBatch = function(ids) {
  // idリストで画像を取得（最大50件ずつ）
  var idStr = 'id=in.(' + ids.join(',') + ')';
  return sbGet('products', idStr + '&select=id,img').then(function(rows) {
    var map = {};
    (rows || []).forEach(function(r) { map[r.id] = r.img || null; });
    return map;
  });
};
// ─ getProductImg（詳細表示時に個別取得） ─
GAS.getProductImg = function(id) {
  return sbGet('products', 'id=eq.' + id + '&select=img').then(function(rows) {
    return rows && rows[0] ? rows[0].img : null;
  });
};
// ─ saveImageData / updateImg ─
GAS.saveImageData = function(base64data, productId) {
  return sbPatch('products', 'id=eq.' + productId, { img: base64data })
    .then(function() { return { ok: true, url: base64data }; });
};
GAS.updateImg = function(id, img) {
  return sbPatch('products', 'id=eq.' + id, { img: img || null })
    .then(function() { return { ok: true }; });
};

// ─ saveSortOrder ─
GAS.saveSortOrder = function(orderArr) {
  var promises = orderArr.map(function(id, idx) {
    return sbPatch('products', 'id=eq.' + id, { sort_order: idx });
  });
  return Promise.all(promises).then(function() { return { ok: true }; });
};

// ─ getSuppliers ─
GAS.getSuppliers = function() {
  return sbGet('suppliers', 'select=*&order=id.asc').then(function(rows) {
    return (rows || []).map(function(r) {
      return { id:r.id, name:r.name||'', fax:r.fax||'', tel:r.tel||'', address:r.address||'', memo:r.memo||'' };
    });
  });
};

// ─ addSupplier ─
GAS.addSupplier = function(s) {
  return sbPost('suppliers', { name:s.name||'', fax:s.fax||'', tel:s.tel||'', address:s.address||'', memo:s.memo||'' })
    .then(function(res) { var r = Array.isArray(res)?res[0]:res; return { ok:true, id:r.id }; });
};

// ─ updateSupplier ─
GAS.updateSupplier = function(s) {
  return sbPatch('suppliers', 'id=eq.' + s.id, { name:s.name, fax:s.fax, tel:s.tel, address:s.address, memo:s.memo })
    .then(function() { return { ok:true }; });
};

// ─ deleteSupplier ─
GAS.deleteSupplier = function(id) {
  return sbDelete('suppliers', 'id=eq.' + id).then(function() { return { ok:true }; });
};

// ─ getOrders ─
GAS.getOrders = function() {
  return sbGet('purchase_orders', 'select=*&order=id.desc').then(function(rows) {
    return (rows || []).map(function(r) {
      return {
        id:            r.id,
        order_id:      r.order_id,
        date:          r.date          || '',
        supplier_name: r.supplier_name || '',
        product_id:    r.product_id    || 0,
        product_name:  r.product_name  || '',
        buy_price:     r.buy_price     || 0,
        buy_qty:       r.buy_qty       || 0,
        order_qty:     r.order_qty     || 0,
        unit:          r.unit          || '個',
        status:        r.status        || 'pending',
        memo:          r.memo          || ''
      };
    });
  });
};

// ─ saveOrder ─
GAS.saveOrder = function(data) {
  // order_id はmax+1で採番
  return sbGet('purchase_orders', 'select=order_id&order=order_id.desc&limit=1')
    .then(function(rows) {
      var nextOrderId = rows && rows[0] ? (rows[0].order_id + 1) : 1;
      var items = data.items || [];
      var bodies = items.map(function(item) {
        return {
          order_id:      nextOrderId,
          date:          data.date          || todayJST(),
          supplier_name: data.supplier_name || '',
          product_id:    Number(item.product_id)  || null,
          product_name:  item.product_name  || '',
          buy_price:     Number(item.buy_price)    || 0,
          buy_qty:       Number(item.buy_qty)      || 0,
          order_qty:     Number(item.order_qty)    || 0,
          unit:          item.unit          || '個',
          status:        'pending',
          memo:          item.memo          || ''
        };
      });
      return sbPost('purchase_orders', bodies);
    })
    .then(function(res) {
      var r = Array.isArray(res) ? res[0] : res;
      return { ok:true, order_id: r ? r.order_id : 1 };
    });
};

// ─ deleteOrder ─
GAS.deleteOrder = function(orderId) {
  return sbDelete('purchase_orders', 'order_id=eq.' + orderId)
    .then(function() { return { ok:true }; });
};

// ─ receiveOrderItem ─
GAS.receiveOrderItem = function(arg) {
  var itemId, opts;
  if (Array.isArray(arg)) { itemId = arg[0]; opts = arg[1] || {}; }
  else { itemId = arg; opts = {}; }

  return sbGet('purchase_orders', 'id=eq.' + itemId + '&select=*')
    .then(function(rows) {
      if (!rows || !rows[0]) throw new Error('見つかりません');
      var r = rows[0];
      if (r.status === 'received') throw new Error('既に入荷済みです');

      var buyPrice  = opts.buy_price  !== undefined ? Number(opts.buy_price)  : r.buy_price;
      var buyQty    = opts.buy_qty    !== undefined ? Number(opts.buy_qty)     : r.buy_qty;
      var orderQty  = opts.order_qty  !== undefined ? Number(opts.order_qty)   : r.order_qty;
      var exp       = opts.exp || '';
      var iri       = buyQty * orderQty;
      var tanka     = (buyPrice > 0 && buyQty > 0) ? buyPrice / buyQty : 0;
      var productId = r.product_id;

      // 発注をreceivedに
      return sbPatch('purchase_orders', 'id=eq.' + itemId, { status:'received' })
        .then(function() {
          if (!productId) return;
          var pUpd = {};
          if (buyPrice) pUpd.buy_price = buyPrice;
          if (buyQty)   pUpd.buy_qty   = buyQty;
          if (exp)      pUpd.exp       = exp;
          return sbGet('products', 'id=eq.' + productId + '&select=status,price')
            .then(function(prows) {
              var p = prows && prows[0];
              if (p && p.status === 'candidate') pUpd.status = 'active';
              if (Object.keys(pUpd).length) return sbPatch('products','id=eq.'+productId,pUpd);
            });
        })
        .then(function() {
          if (!productId) return;
          // 1ロットずつ仕入れ履歴に追加（pending状態）
          var rows = [];
          for (var i = 0; i < orderQty; i++) {
            rows.push({
              product_id: productId,
              nm:         r.product_name,
              iri:        buyQty,
              buy_price:  buyPrice,
              tanka:      tanka,
              sell:       r.sell || 0,
              d:          todayJST(),
              status:     'pending'
            });
          }
          return sbPost('restock', rows);
        })
        .then(function() { return { ok:true, nm:r.product_name, iri:iri }; });
    });
};

// ─ sendFaxEmail（後回し：ダミー返却） ─
GAS.sendFaxEmail = function(data) {
  return Promise.resolve({ error: 'FAX送信はEdge Function移行後に対応予定です' });
};

// ─ getSettings ─
GAS.getSettings = function() {
  return sbGet('settings', 'select=*').then(function(rows) {
    var map = {};
    (rows || []).forEach(function(r) { map[r.key] = r.value; });
    return {
      customButtons:   JSON.parse(map['customButtons']   || '[]'),
      customDiscounts: JSON.parse(map['customDiscounts'] || '[]'),
      regiDefaults:    JSON.parse(map['regiDefaults']    || '{}')
    };
  });
};

// ─ saveSettings ─
GAS.saveSettings = function(customButtonsJson, customDiscountsJson) {
  var btnStr      = typeof customButtonsJson   === 'string' ? customButtonsJson   : JSON.stringify(customButtonsJson);
  var discountStr = typeof customDiscountsJson  === 'string' ? customDiscountsJson  : JSON.stringify(customDiscountsJson);
  return Promise.all([
    sbFetch('settings', { method:'POST', body:JSON.stringify({ key:'customButtons',   value:btnStr      }), prefer:'resolution=merge-duplicates,return=representation' }),
    sbFetch('settings', { method:'POST', body:JSON.stringify({ key:'customDiscounts', value:discountStr }), prefer:'resolution=merge-duplicates,return=representation' })
  ]).then(function() { return 'OK'; });
};

// ─ saveRegiDefaults ─
GAS.saveRegiDefaults = function(jsonStr) {
  return sbFetch('settings', { method:'POST', body:JSON.stringify({ key:'regiDefaults', value:jsonStr }), prefer:'resolution=merge-duplicates,return=representation' })
    .then(function() { return 'OK'; });
};

// ─ getTodaySalesData ─
GAS.getTodaySalesData = function() {
  var today = todayJST();
  // +をURLエンコード（%2B）してSupabase REST APIに渡す
  var gte = today + 'T00%3A00%3A00%2B09%3A00';
  var lte = today + 'T23%3A59%3A59%2B09%3A00';
  return sbGet('order_items',
    'select=order_code,label,qty,subtotal,status&ts=gte.' + gte + '&ts=lte.' + lte + '&limit=10000'
  ).then(function(rows) {
    var orderIds = {};
    var itemMap  = {};
    var total    = 0;
    (rows || []).forEach(function(r) {
      if (r.status === '無効') return;
      if ((r.label || '').indexOf('無料') >= 0) return;
      orderIds[r.order_code] = true;
      total += r.subtotal || 0;
      if (!itemMap[r.label]) itemMap[r.label] = { qty:0, subtotal:0 };
      itemMap[r.label].qty      += r.qty || 1;
      itemMap[r.label].subtotal += r.subtotal || 0;
    });
    var items = Object.keys(itemMap).map(function(k) {
      return { name:k, qty:itemMap[k].qty, subtotal:itemMap[k].subtotal };
    }).sort(function(a,b){ return b.subtotal - a.subtotal; });
    return { total:total, count:Object.keys(orderIds).length, items:items };
  });
};

// ─ saveOrderFromRegi ─
GAS.saveOrderFromRegi = function(jsonStr) {
  var payload = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  var jst     = new Date(new Date().getTime() + 9*60*60*1000);
  var orderCode = jst.toISOString().replace(/[-:T]/g,'').slice(0,14) + '_' + Math.floor(Math.random()*1000);
  var ts        = payload.timestamp || nowJST();
  var deposit   = payload.received  || 0;
  var change    = payload.change    || 0;
  var items     = [
    ...(payload.orders    || []),
    ...(payload.free      || []),
    ...(payload.discounts || [])
  ];
  if (!items.length) return Promise.resolve('保存完了');
  var bodies = items.map(function(item) {
    return {
      order_code: 'ID:' + orderCode,
      ts:         ts,
      label:      item.label,
      price:      item.price,
      qty:        item.qty || 1,
      subtotal:   item.subtotal !== undefined ? item.subtotal : item.price,
      deposit:    deposit,
      change:     change,
      status:     '有効'
    };
  });
  return sbPost('order_items', bodies).then(function() { return '保存完了'; });
};

// ─ getSummaryData ─
GAS.getSummaryData = function() {
  return sbGet('daily_summary', 'select=*&order=date.desc').then(function(rows) {
    return (rows || []).map(function(r) {
      var fixed   = Number(r.fixed_cash)  || 0;
      var sales   = Number(r.sales_total) || 0;
      var actual  = Number(r.actual_cash) || 0;
      var diff    = Number(r.diff)        || 0;
      // レジにあるべき現金 = 固定準備金 + 売上合計
      var should  = fixed + sales;
      return {
        '日付':             r.date        || '',
        '販売場所':         r.location    || '',
        '今日の売上合計':   sales,
        '固定準備金':       fixed,
        'レジ内現金残高':   actual,
        'レジにあるべき現金': should,
        '銀行入金額':       0,
        '過不足':           diff,
        '備考':             r.memo        || '',
        '最終更新時刻':     r.closed_at   || '',
        rowNumber:          r.id
      };
    });
  });
};

// ─ saveClosingData ─
GAS.saveClosingData = function(payload) {
  var body = {
    location:    payload.location   || '',
    actual_cash: Number(payload.actualCash) || 0,
    memo:        payload.memo       || '',
    closed_at:   nowJST()
  };
  if (payload.fixedCash !== undefined) body.fixed_cash = Number(payload.fixedCash);

  if (payload.rowNumber) {
    return sbPatch('daily_summary', 'id=eq.' + payload.rowNumber, body)
      .then(function() { return '保存完了！(id:' + payload.rowNumber + ')'; });
  }
  // 日付で検索
  var date = (payload.date || '').replace(/-/g,'/');
  return sbGet('daily_summary', 'date=eq.' + date.replace(/\//g,'-') + '&select=id')
    .then(function(rows) {
      if (rows && rows[0]) {
        return sbPatch('daily_summary', 'id=eq.' + rows[0].id, body)
          .then(function() { return '保存完了！'; });
      }
      // 新規作成
      body.date = date.replace(/\//g,'-');
      return sbPost('daily_summary', body).then(function() { return '保存完了！'; });
    });
};

// ─ getDetailByDate ─
GAS.getDetailByDate = function(searchDate) {
  var d = searchDate.replace(/\//g, '-');
  var gte = d + 'T00%3A00%3A00%2B09%3A00';
  var lte = d + 'T23%3A59%3A59%2B09%3A00';
  return sbGet('order_items',
    'select=*&ts=gte.' + gte + '&ts=lte.' + lte + '&order=id.asc&limit=10000'
  ).then(function(rows) {
    return (rows || []).map(function(r, idx) {
      // GASの行配列形式に合わせる [orderId, ts, label, price, qty, subtotal, deposit, change, status, rowNumber]
      return [r.order_code, r.ts, r.label, r.price, r.qty, r.subtotal, r.deposit, r.change, r.status, r.id];
    });
  });
};

// ─ invalidateDetailRow ─
GAS.invalidateDetailRow = function(rowNumber) {
  return sbPatch('order_items', 'id=eq.' + rowNumber, { status:'無効' })
    .then(function() { return '無効にしました（id:' + rowNumber + '）'; });
};

// ─ updateDetailRow ─
GAS.updateDetailRow = function(rowNumber, values) {
  // values = [orderId, ts, label, price, qty, subtotal, deposit, change, status]
  return sbPatch('order_items', 'id=eq.' + rowNumber, {
    order_code: values[0],
    ts:         values[1],
    label:      values[2],
    price:      values[3],
    qty:        values[4],
    subtotal:   values[5],
    deposit:    values[6],
    change:     values[7],
    status:     values[8]
  }).then(function() { return '保存しました（id:' + rowNumber + '）'; });
};

// ─ getSavingsData ─
GAS.getSavingsData = function() {
  return Promise.all([
    sbGet('order_items', 'select=order_code,ts,label,subtotal,status&limit=10000'),
    sbGet('daily_summary', 'select=date,diff'),
    sbGet('savings', 'select=*&order=date.asc')
  ]).then(function(results) {
    var items    = results[0] || [];
    var diffs    = results[1] || [];
    var savings  = results[2] || [];

    // 日付別売上集計
    var salesByDate = {};
    items.forEach(function(r) {
      if (r.status === '無効') return;
      if ((r.label||'').indexOf('無料') >= 0) return;
      var d = (r.ts || '').split('T')[0];
      if (!d) return;
      salesByDate[d] = (salesByDate[d] || 0) + (r.subtotal || 0);
    });

    // 日付別過不足
    var diffByDate = {};
    diffs.forEach(function(r) { if (r.date) diffByDate[r.date] = r.diff || 0; });

    var allRows = [];

    // 入金行
    Object.keys(salesByDate).forEach(function(date) {
      var s    = salesByDate[date];
      var diff = diffByDate[date] || 0;
      allRows.push({
        type:       'deposit',
        date:       date,
        partner:    '',
        content:    diff !== 0 ? '売上 ¥' + s.toLocaleString() + '（過不足 ' + (diff>0?'+':'') + diff + '）' : '売上',
        deposit:    s + diff,
        withdrawal: 0
      });
    });

    // 出金行
    savings.forEach(function(r) {
      allRows.push({
        type:       'withdrawal',
        date:       r.date || '',
        partner:    r.partner || '',
        content:    r.content || '',
        deposit:    0,
        withdrawal: r.withdrawal || 0
      });
    });

    // 日付ソート
    allRows.sort(function(a, b) {
      var c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return a.type === 'deposit' ? -1 : 1;
    });

    // 残高累積 & 前月繰越挿入
    var balance  = 0;
    var lastMonth = '';
    var result   = [];
    allRows.forEach(function(row) {
      var month = row.date.substring(0, 7);
      if (month !== lastMonth && lastMonth !== '') {
        result.push({ type:'carryover', date:month+'-01', partner:'', content:'前月繰越', deposit:0, withdrawal:0, balance:balance });
      }
      lastMonth = month;
      balance += row.deposit - row.withdrawal;
      row.balance = balance;
      result.push(row);
    });
    return result;
  });
};

// ─ addSavingsRow ─
GAS.addSavingsRow = function(rowData) {
  return sbPost('savings', {
    date:       rowData.date       || todayJST(),
    partner:    rowData.partner    || '',
    content:    rowData.content    || '',
    withdrawal: rowData.withdrawal || 0
  }).then(function() { return '保存しました'; });
};
