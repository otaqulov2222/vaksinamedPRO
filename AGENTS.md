# VAKSINAMED — PROJECT ENGINEERING RULES

## 1. PROJECT MODE

This is NOT a greenfield project.

The VaksinaMed mobile application has already been partially developed.

The existing application contains:

- working UI screens
- navigation
- buttons
- interactions
- local/mock data
- product/catalog UI
- cashback UI
- pharmacy UI
- order UI
- profile UI
- QR functionality
- existing reusable components

The existing application is the foundation of the production VaksinaMed platform.

DO NOT rebuild the application from scratch.

DO NOT throw away the existing implementation.

DO NOT replace working functionality unnecessarily.

The goal is to evolve the existing application into a production-ready scalable pharmacy platform.

---

# 2. EXISTING FRONTEND MUST BE PRESERVED

The current VaksinaMed mobile UI is the approved visual baseline.

DO NOT redesign existing screens unless explicitly requested by the product owner.

Preserve:

- VaksinaMed logo
- purple/yellow brand identity
- existing colors
- typography
- spacing
- rounded cards
- buttons
- icons
- bottom navigation
- central QR button
- home screen structure
- catalog structure
- product cards
- cashback card
- nearest pharmacy card
- profile structure
- orders structure
- overall UX

Do not introduce unrelated design trends.

Do not replace the current UI with a generic pharmacy template.

If a UI change is technically necessary:

1. Explain why.
2. Identify the affected component.
3. Propose the smallest possible change.
4. Do not redesign unrelated screens.

---

# 3. EXISTING APPLICATION MUST BE AUDITED FIRST

Before modifying important code:

1. Inspect the repository.
2. Understand the current framework.
3. Understand the folder structure.
4. Identify screens.
5. Identify navigation.
6. Identify components.
7. Identify state management.
8. Identify models.
9. Identify local/mock data.
10. Identify services.
11. Identify API integrations.
12. Identify database usage.
13. Identify authentication.
14. Identify cart logic.
15. Identify product logic.
16. Identify cashback logic.
17. Identify branch/pharmacy logic.
18. Identify QR functionality.
19. Identify order functionality.
20. Identify profile functionality.

Never modify a major system blindly.

---

# 4. DO NOT DESTROY WORKING CODE

Never delete working functionality simply because a different implementation is preferred.

Never rewrite the entire application unless explicitly instructed.

Prefer:

- extension
- refactoring
- modularization
- migration
- incremental improvement

over:

- complete rewrite
- destructive replacement

---

# 5. EXISTING MOCK DATA MUST GRADUALLY BECOME REAL DATA

The current application may contain:

- hardcoded products
- hardcoded prices
- mock branches
- mock cashback
- mock user information
- mock orders
- mock inventory

These must gradually be replaced with real backend data.

Do not remove the UI while implementing the backend.

Target architecture:

Mobile UI
↓
Repository / Service
↓
API Client
↓
Backend
↓
Business Logic
↓
PostgreSQL / Redis
↓
External integrations

The mobile UI must not directly access the database.

---

# 6. DATA ABSTRACTION

Create proper repositories/services where necessary.

Examples:

- ProductRepository
- BranchRepository
- UserRepository
- CartRepository
- OrderRepository
- CashbackRepository
- InventoryRepository
- ReservationRepository
- PaymentRepository
- DeliveryRepository
- NotificationRepository

The UI should consume these abstractions instead of directly depending on mock data.

---

# 7. BACKEND IS AUTHORITATIVE

Never trust the mobile application for critical business information.

The backend is authoritative for:

- prices
- inventory
- order totals
- cashback
- discounts
- promotions
- payment status
- order status
- user permissions
- branch availability

The client can display information, but the server must validate it.

---

# 8. INVENTORY SAFETY

Inventory consistency is critical.

Never trust stock values received from the mobile application.

Prevent overselling.

All critical inventory operations must use proper database transactions and concurrency control.

Example:

If only 2 units exist and 3 users attempt to reserve simultaneously:

- User 1 succeeds.
- User 2 succeeds.
- User 3 fails.

The database must remain consistent.

---

# 9. FINANCIAL SAFETY

Financial operations include:

- payments
- cashback
- refunds
- discounts
- order totals

These must be processed server-side.

Never trust a price or cashback amount sent by the mobile application.

Never mark an order as paid only because the mobile application says payment succeeded.

Payment status must come from verified backend/payment-provider communication.

---

# 10. CASHBACK SAFETY

Cashback must be treated as financial data.

Use a transaction ledger.

Support concepts such as:

- EARNED
- USED
- EXPIRED
- REVERSAL
- REFUND
- ADJUSTMENT

Every cashback adjustment must be auditable.

Prevent:

- negative balances
- double spending
- concurrent spending
- unauthorized adjustments

---

# 11. SECURITY

Never put secrets in the mobile application.

Never commit:

- database passwords
- API secrets
- payment secrets
- private keys
- production credentials

Never log:

- passwords
- OTP codes
- access tokens
- refresh tokens
- card numbers
- sensitive personal information

Use:

- authentication
- authorization
- rate limiting
- validation
- secure token handling
- audit logging
- least privilege

---

# 12. ROLE-BASED ACCESS

The system must support role-based permissions.

Potential roles include:

- CUSTOMER
- BRANCH_EMPLOYEE
- BRANCH_MANAGER
- WAREHOUSE_MANAGER
- DELIVERY_OPERATOR
- SUPPORT_AGENT
- MARKETING_MANAGER
- FINANCE_MANAGER
- ADMIN
- SUPER_ADMIN

Do not give every user unrestricted access.

Backend authorization is mandatory.

---

# 13. SCALABILITY

The architecture must support:

Initial:

- 200+ branches
- Uzbekistan-wide operation
- thousands of products
- potentially large customer base

Future:

- 500+ branches
- 1,000+ branches
- thousands of concurrent users
- significantly higher traffic

Do not hard-code:

- branch count
- product count
- cashback percentage
- loyalty levels
- delivery prices
- payment provider

Important business configuration should be configurable.

---

# 14. ARCHITECTURE PRINCIPLE

Do not immediately over-engineer the project into dozens of microservices.

Prefer a modular monolith initially.

Use clear modules so that services can be separated later if scale requires it.

Initial architecture should support:

- stateless application servers
- PostgreSQL
- Redis
- background jobs
- object storage
- load balancing
- CDN
- monitoring
- logging
- automated backups

---

# 15. MOBILE APPLICATION

The mobile application should remain the customer-facing application.

Existing screens should be preserved.

Existing navigation should not be replaced without approval.

The current conceptual navigation includes:

- Home
- Catalog
- QR
- Orders
- Profile

The central QR action should remain visually prominent unless explicitly changed.

---

# 16. HOME SCREEN

Existing home screen elements should eventually become real data:

- customer greeting
- notifications
- cart
- search
- promotions
- cashback
- loyalty level
- nearest pharmacy
- quick actions

Example:

"5,000 so'm"

must eventually come from the customer's real cashback account.

"Silver"

must eventually come from the real loyalty system.

"Nearest pharmacy"

must eventually use real branch data and location logic.

Do not leave these values permanently hardcoded.

---

# 17. CATALOG

Existing catalog UI must be preserved.

Connect it to real backend data.

Support:

- products
- categories
- brands
- search
- filters
- sorting
- pagination
- favorites
- prices
- discounts
- availability

Do not trust client-side prices or inventory.

---

# 18. PRODUCT SEARCH

Search should support:

- product name
- partial name
- brand
- category
- barcode where supported
- generic name where authorized

Use:

- debounce
- pagination
- loading state
- empty state
- error state
- retry
- caching where appropriate

Do not make an API request for every keystroke.

---

# 19. BRANCHES

Each branch should support:

- unique ID
- name
- region
- city
- address
- latitude
- longitude
- phone
- working hours
- status
- pickup availability
- delivery availability

The system must support 1,000+ branches without redesigning the database.

---

# 20. NEAREST PHARMACY

Nearest pharmacy logic should use:

- user coordinates
- active branches
- branch coordinates
- distance
- availability
- business rules

Do not permanently hardcode a branch.

Use appropriate geographic queries.

---

# 21. CART

Cart must eventually support:

- products
- quantities
- branch
- price
- discounts
- stock
- cashback
- pickup
- delivery

At checkout the backend must revalidate everything.

---

# 22. RESERVATION

Reservation must be server-controlled.

Flow:

Customer
↓
Product
↓
Branch
↓
Availability check
↓
Reservation
↓
Inventory reservation
↓
Expiration timer
↓
Branch preparation
↓
Pickup
↓
Completed

Expired reservations must release inventory.

---

# 23. ORDERS

Orders must use controlled status transitions.

Potential statuses:

CREATED
PENDING_PAYMENT
PAID
CONFIRMED
PREPARING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
DELIVERED
COMPLETED
CANCELLED
REFUNDED
FAILED

The client must not arbitrarily change order status.

---

# 24. PAYMENTS

Payment integration must be provider-agnostic.

Architecture must allow providers such as:

- Click
- Payme
- Uzcard/Humo-compatible gateways
- future providers

Payment provider secrets belong only on the backend.

Payment callbacks/webhooks must be verified.

Use idempotency for payment operations.

---

# 25. DELIVERY

Delivery should support:

- saved addresses
- coordinates
- delivery zones
- delivery fee
- pickup
- home delivery
- delivery status
- future external delivery providers

Do not hard-code delivery pricing.

---

# 26. NOTIFICATIONS

Support architecture for:

- push notifications
- SMS
- in-app notifications
- email where necessary

Use background jobs.

Notifications must not unnecessarily block critical transactions.

---

# 27. ADMIN

Admin must eventually manage:

- branches
- products
- categories
- brands
- prices
- inventory
- orders
- customers
- cashback
- loyalty
- promotions
- delivery
- payments
- notifications
- analytics
- users
- permissions
- audit logs
- settings

Use role-based access.

---

# 28. DATABASE

Use a relational database architecture suitable for:

- 200+ branches
- 1,000+ branches
- large product catalog
- large order history
- inventory
- cashback transactions

Prefer PostgreSQL unless the existing project has a justified alternative.

Use:

- foreign keys
- unique constraints
- indexes
- transactions
- migrations

Do not create tables blindly.

---

# 29. PERFORMANCE

The system must be designed for:

- pagination
- caching
- optimized queries
- database indexing
- background processing
- horizontal scaling

Do not load thousands of records into mobile memory.

Do not perform expensive full-table scans for normal user requests.

---

# 30. AI CODING RULES

When working as an AI coding agent:

Before changing an important module:

1. Inspect relevant files.
2. Understand dependencies.
3. Identify affected components.
4. Identify affected database/API dependencies.
5. Make a plan.
6. Implement the smallest safe change.
7. Run tests.
8. Run typecheck.
9. Run lint.
10. Review security and edge cases.

Never blindly rewrite large sections of the project.

---

# 31. NO UNAUTHORIZED BUSINESS ASSUMPTIONS

Do not invent important business rules.

If requirements are unclear, identify them as:

OPEN BUSINESS DECISION

Examples:

- cashback percentage
- maximum cashback usage
- reservation duration
- refund rules
- prescription workflow
- delivery pricing
- inventory source of truth
- payment provider
- loyalty rules

Do not silently invent financial or medical logic.

---

# 32. TESTING

Every important feature must have appropriate tests.

Test:

- authentication
- products
- search
- inventory
- reservation
- orders
- payments
- cashback
- delivery
- permissions
- concurrency

Critical financial and inventory logic must be tested.

---

# 33. EXISTING UI MUST REMAIN FUNCTIONAL

After every significant backend integration verify:

- navigation
- buttons
- loading
- errors
- empty states
- API data
- cart
- product display
- cashback display
- pharmacy display
- orders
- profile

Do not break existing functionality while implementing backend systems.

---

# 34. DO NOT START FROM ZERO

The goal is:

EXISTING VAKSINAMED UI
+
REAL BACKEND
+
REAL DATABASE
+
REAL INVENTORY
+
REAL ORDERS
+
REAL PAYMENTS
+
REAL CASHBACK
+
REAL DELIVERY
+
REAL ADMIN
+
REAL CLOUD
+
REAL SECURITY

The current application is the foundation.

It is NOT disposable prototype code.

---

# 35. MASTER SPECIFICATION

Before implementing major features, read:

docs/MASTER_SPECIFICATION.md

The Master Specification contains the complete VaksinaMed technical requirements.

AGENTS.md contains permanent project rules.

docs/MASTER_SPECIFICATION.md contains the detailed system specification.

Always consider both documents before major implementation decisions.