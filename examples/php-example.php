<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PHP + Recommend SDK</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 0 20px; }
    button { margin: 10px 5px; padding: 10px 20px; cursor: pointer; }
    .product { border: 1px solid #ddd; padding: 15px; margin: 10px 0; }
  </style>
</head>
<body>
  <?php
  // PHP 세션/인증 예제
  session_start();
  
  // 사용자 정보 (실제로는 DB/세션에서 가져옴)
  $userId = $_SESSION['user_id'] ?? null;
  $isLoggedIn = !empty($userId);
  
  // 상품 정보 (실제로는 DB에서 가져옴)
  $product = [
    'sku' => 'LAPTOP-001',
    'name' => '노트북',
    'price' => 1500000,
    'category' => 'electronics'
  ];
  ?>

  <h1>🐘 PHP + Recommend SDK</h1>
  
  <?php if ($isLoggedIn): ?>
    <p>안녕하세요, <?php echo htmlspecialchars($userId); ?>님!</p>
    <button onclick="logout()">로그아웃</button>
  <?php else: ?>
    <p>로그인이 필요합니다.</p>
    <button onclick="login()">로그인</button>
  <?php endif; ?>

  <div class="product">
    <h3><?php echo htmlspecialchars($product['name']); ?></h3>
    <p>가격: <?php echo number_format($product['price']); ?>원</p>
    <button onclick="selectColor()">옵션 선택 (색상)</button>
    <button onclick="selectSize()">옵션 선택 (사이즈)</button>
    <button onclick="addToCart()">장바구니 담기</button>
    <button onclick="purchase()">구매하기</button>
    <button onclick="purchaseCard()">카드 결제</button>
  </div>

  <!-- CDN 방식 (배포용) -->
  <script src="https://cdn.example.com/recommend-sdk.min.js"></script>
  
  <!-- 또는 로컬 파일 -->
  <!-- <script src="/assets/js/recommend-sdk.min.js"></script> -->

  <script>
    // PHP에서 전달받은 데이터
    const phpData = {
      userId: <?php echo $userId ? json_encode($userId) : 'null'; ?>,
      isLoggedIn: <?php echo $isLoggedIn ? 'true' : 'false'; ?>,
      product: <?php echo json_encode($product); ?>
    };

    // demo state (option payload 누적)
    const state = {
      sku: phpData.product.sku,
      selectedOptions: [],
    };

    // 1) SDK 초기화 init (env만 있어도 동작)
    RecommendSDK.init({ env: 'production', userId: phpData.userId });

    console.log('✅ SDK 초기화:', {
      version: RecommendSDK.version,
      userId: RecommendSDK.config.userId
    });

    // 페이지 로드 시 상품 조회 이벤트
    RecommendSDK.trackEvent('view_item', {
      sku: phpData.product.sku,
      name: phpData.product.name,
      category: phpData.product.category,
    });

    // 5) sku 같은 option payload 추가 예제
    function selectColor() {
      const color = ['black', 'silver', 'blue'][Math.floor(Math.random() * 3)];
      state.selectedOptions.push({ name: 'color', value: color });
      RecommendSDK.trackEvent('select_option', {
        sku: state.sku,
        optionName: 'color',
        optionValue: color,
        selectedOptions: state.selectedOptions.slice(),
      });
      alert('색상 선택: ' + color);
    }

    function selectSize() {
      const size = ['S', 'M', 'L'][Math.floor(Math.random() * 3)];
      state.selectedOptions.push({ name: 'size', value: size });
      RecommendSDK.trackEvent('select_option', {
        sku: state.sku,
        optionName: 'size',
        optionValue: size,
        selectedOptions: state.selectedOptions.slice(),
      });
      alert('사이즈 선택: ' + size);
    }

    // 장바구니 담기
    function addToCart() {
      RecommendSDK.trackEvent('add_to_cart', {
        sku: phpData.product.sku,
        name: phpData.product.name,
        price: phpData.product.price,
        quantity: 1,
        options: state.selectedOptions.slice(),
      });

      // PHP 서버로 전송 (실제 장바구니 처리)
      fetch('/cart/add.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: phpData.product.sku,
          quantity: 1
        })
      }).then(() => {
        alert('장바구니에 추가되었습니다!');
      });
    }

    // 구매하기
    function purchase() {
      const orderId = 'ORD-' + Date.now();

      RecommendSDK.trackEvent('purchase', {
        orderId: orderId,
        amount: phpData.product.price,
        paymentMethod: 'unknown',
        items: [{ sku: phpData.product.sku, quantity: 1, options: state.selectedOptions.slice() }],
      });

      // PHP 서버로 전송 (실제 주문 처리)
      fetch('/order/create.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderId,
          items: [{ sku: phpData.product.sku, quantity: 1 }]
        })
      }).then(() => {
        alert('구매가 완료되었습니다!');
        window.location.href = '/order/success.php?id=' + orderId;
      });
    }

    // 4) 구매시, 카드 구입 이벤트 예제
    function purchaseCard() {
      const orderId = 'ORD-' + Date.now();
      RecommendSDK.trackEvent('purchase', {
        orderId,
        amount: phpData.product.price,
        paymentMethod: 'card',
        items: [{ sku: phpData.product.sku, quantity: 1, options: state.selectedOptions.slice() }],
        card: { issuer: 'demo', installmentMonths: 0 },
      });
      alert('카드 결제 완료!');
    }

    // 로그인 (예제)
    function login() {
      // 실제로는 로그인 폼으로 이동
      const testUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      
      // 2) 로그인 유저 인증관련 (SDK에 사용자 정보 설정)
      RecommendSDK.identify({ userId: testUserId });

      // PHP 세션에도 저장 (실제 로그인 처리)
      fetch('/auth/login.php', {
        method: 'POST',
        body: JSON.stringify({ userId: testUserId })
      }).then(() => {
        window.location.reload();
      });
    }

    // 로그아웃
    function logout() {
      // 3) 로그아웃 로그 인증관련 (SDK에서 로그아웃)
      RecommendSDK.logout();

      // PHP 세션 삭제 (실제 로그아웃 처리)
      fetch('/auth/logout.php', { method: 'POST' })
        .then(() => {
          window.location.reload();
        });
    }
  </script>
</body>
</html>

<?php
/**
 * ============================================
 * PHP 서버 사이드 예제 (cart/add.php)
 * ============================================
 */
/*
<?php
session_start();

// JSON 요청 파싱
$input = json_decode(file_get_contents('php://input'), true);
$sku = $input['sku'] ?? null;
$quantity = $input['quantity'] ?? 1;

if (!$sku) {
  http_response_code(400);
  echo json_encode(['error' => 'SKU required']);
  exit;
}

// 장바구니에 추가 (세션 또는 DB)
if (!isset($_SESSION['cart'])) {
  $_SESSION['cart'] = [];
}

$_SESSION['cart'][$sku] = [
  'sku' => $sku,
  'quantity' => $quantity,
  'added_at' => date('Y-m-d H:i:s')
];

echo json_encode([
  'success' => true,
  'cart' => $_SESSION['cart']
]);
?>
*/

/**
 * ============================================
 * PHP 로그인 예제 (auth/login.php)
 * ============================================
 */
/*
<?php
session_start();

$input = json_decode(file_get_contents('php://input'), true);
$userId = $input['userId'] ?? null;

if (!$userId) {
  http_response_code(400);
  exit;
}

// 실제로는 DB에서 사용자 인증
$_SESSION['user_id'] = $userId;
$_SESSION['logged_in_at'] = date('Y-m-d H:i:s');

echo json_encode(['success' => true]);
?>
*/

/**
 * ============================================
 * PHP 로그아웃 예제 (auth/logout.php)
 * ============================================
 */
/*
<?php
session_start();
session_destroy();
echo json_encode(['success' => true]);
?>
*/
?>
