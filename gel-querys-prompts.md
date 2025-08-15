---
description: 
globs: 
alwaysApply: true
---
Always use Context7 Lookups for context on Syntax, queries & anything related to Scheam work. 

Skip making the 1st Tool call and just use the Library ID: /geldata/gel 

## ALWAYS LOOK UP THINGS EVEN IF YOU DONT NEED TO IT WILL MAKE YOU MORE PRODUCTIVE

For any EdgeQL queries of any kind.. you can use the following keywords for search it is RAG but I think using these words in the search would be best.

Overview
Literals
Sets
Paths
Types
Parameters
Select
Insert
Update
Delete
For
Group
With
Analyze
Path scoping
Transactions

For anything Schema Related please use the following based on the cotext of the goal you are trying to achieve.

Object Types
Properties
Links
Computeds
Primitives
Indexes
Constraints
Inheritance
Aliases
Globals
Access Policies
Functions
Triggers
Mutation rewrites
Link properties
Modules
Migrations
Branches
Extensions
Annotations

## 🎯 **Core Performance Principles**

### 1. **Use Single Links for One-to-Many (Avoid Unnecessary `multi` Join Tables)**

**✅ Best Practice:**
```edgeql
# ✅ GOOD - Single link on the "many" side (efficient foreign key)
type SpeakerLabel {
  required conversation: ConversationInsight;  # Single link
}

# ✅ GOOD - Computed backlink on the "one" side (no join table!)
type ConversationInsight {
  speaker_labels := .<conversation[is SpeakerLabel];  # Efficient backlink
}
```

**❌ Avoid:**
```edgeql
# ❌ BAD - Creates unnecessary join table
type ConversationInsight {
  multi speaker_labels: SpeakerLabel;  # Hidden join table overhead
}
```

**Why:** Single links are implemented as indexed foreign key columns. Multi links create hidden join tables with extra overhead for one-to-many relationships.

### 2. **Use Link Properties Judiciously**

**✅ Use for Many-to-Many with Relationship Data:**
```edgeql
type Person {
  multi friends: Person {
    strength: float64;           # Link property for relationship data
    since: cal::local_date;      # When friendship started
  };
}
```

**❌ Avoid for Simple One-to-Many:**
```edgeql
# ❌ BAD - Unnecessary complexity for simple relationship
type Contact {
  customer_rep: SystemUser {
    assigned_date: datetime;     # Just put this on Contact itself
  };
}

# ✅ BETTER - Simple property on the object
type Contact {
  customer_rep: SystemUser;
  rep_assigned_date: datetime;   # Much simpler
}
```

### 3. **Multi Properties vs Arrays for Scalar Collections**

**Arrays for Lists Handled as Wholes:**
```edgeql
type ConversationInsight {
  # ✅ Array - typically retrieved/stored as complete list
  phrase_indexes: array<int32>;
  word_indexes: array<int32>;
}
```

**Multi Properties for Individual Element Queries:**
```edgeql
type ConversationInsight {
  # ✅ Multi - frequently filter/query individual key phrases
  multi key_phrases: str;
}

# Query individual phrases efficiently
select ConversationInsight filter 'complaint' in .key_phrases;
```

---

## 🏗️ **Inheritance vs Composition Patterns**

### 4. **Leverage Polymorphic Inheritance (GEL 6.8+ Optimized)**

**✅ Best Practice - Inheritance Hierarchy:**
```edgeql
# Abstract base with common fields
abstract type Person extending default::Timestamped {
  first_name: str;
  middle_name: str;
  last_name: str;
  full_name := .first_name ++ ((' ' ++ .middle_name) if exists .middle_name else '') ++ (' ' ++ .last_name);
  email: str;
  primary_phone: str;
  mobile_phone: str;
}

# Concrete types for specific roles
type SystemUser extending Person {
  required system_user_id: uuid { constraint exclusive; };
  department: str;
}

type Contact extending Person {
  required contactid: uuid { constraint exclusive; };
  customer_since: datetime;
}

# Handle multiple roles naturally!
type SystemUserContact extending Person {
  required system_user_id: uuid { constraint exclusive; };
  required contactid: uuid { constraint exclusive; };
  department: str;
  customer_since: datetime;
}
```

**✅ Clean Polymorphic Usage:**
```edgeql
type SpeakerLabel {
  speaker_identity: Person;  # Single clean polymorphic link
}

# Query with type discrimination
select SpeakerLabel {
  speaker_identity: {
    full_name,
    email,
    type_name := .__type__.name,
    [is SystemUser].system_user_id,
    [is Contact].contactid,
    [is SystemUserContact] { system_user_id, contactid }  # Both!
  }
}
```

**Why This Works:**
- **Type system handles discrimination** (no manual enums needed)
- **Natural multiple role support** (person can be both employee AND customer)
- **Excellent performance** in GEL 6.8+ (proper SQL compilation)
- **Future-proof** (easy to add new person types)

### 5. **Avoid Composition Anti-Patterns**

**❌ Avoid - Complex Role Tables:**
```edgeql
# ❌ BAD - Unnecessary complexity
type Person {
  multi roles: PersonRole;  # Extra join overhead
}

abstract type PersonRole {
  person: Person;  # Circular complexity
}
```

**✅ Better - Direct Inheritance:**
```edgeql
# ✅ GOOD - Direct, clear, performant
type SystemUser extending Person { ... }
type Contact extending Person { ... }
```

---

## 📊 **Indexing and Query Optimization**

### 6. **Strategic Index Placement**

**✅ Index Fields You Actually Filter/Order By:**
```edgeql
type Person {
  email: str;
  primary_phone: str;
  
  # ✅ Index frequently filtered fields
  index on (.email);
  index on (.primary_phone);
}

type ConversationInsight {
  total_duration_seconds: float64;
  
  # ✅ Index for dashboard queries
  index on (.total_duration_seconds);
}
```

**❌ Avoid Over-Indexing:**
```edgeql
type Person {
  # ❌ Don't index every field
  middle_name: str {
    index;  # Rarely filtered - unnecessary overhead
  };
}
```

**Auto-Indexed Fields (No Manual Index Needed):**
- Object `id` (primary key)
- All links (foreign keys)  
- Properties with `exclusive` constraints

### 7. **Embrace Nested Object-Oriented Queries**

**✅ Leverage GEL's Strength:**
```edgeql
# ✅ Single efficient query for complex data
select ConversationInsight {
  total_duration_seconds,
  executive_summary: {
    call_outcome,
    service_type,
    structured_summary: {
      customer_issue_summary,
      resolution_provided
    }
  },
  speaker_labels: {
    speaker_id,
    name,
    speaker_identity: {
      full_name,
      [is SystemUser].department,
      [is Contact].customer_since
    }
  },
  action_items: {
    item,
    owner,
    status
  }
}
```

**Why:** GEL compiles nested queries into efficient SQL with sub-selects. This is faster and more network-efficient than multiple queries or massive joins.

---

## 🔧 **Advanced Performance Patterns**

### 8. **Computed Fields vs Materialized Data**

**✅ Computed for Derived Data:**
```edgeql
type Person {
  first_name: str;
  last_name: str;
  # ✅ Computed - always up-to-date, no storage cost
  full_name := .first_name ++ ' ' ++ .last_name;
}
```

**✅ Materialized for Expensive Calculations:**
```edgeql
type ConversationInsight {
  # ✅ Materialized - updated by ETL/triggers
  sentiment_volatility: float64;  # Expensive to compute
  most_negative_minute: int32;    # Cached result
}
```

### 9. **Access Policies - Use Sparingly**

**✅ Critical Security Only:**
```edgeql
type SensitiveData {
  # ✅ Simple, focused access policy
  access policy authenticated_users
    allow all
    using (global current_user_id ?= .owner_id);
}
```

**❌ Avoid Complex Stacked Policies:**
```edgeql
# ❌ Too many complex policies slow queries
type OverPoliciedType {
  access policy policy1 allow select using (...complex logic...);
  access policy policy2 allow update using (...more complex logic...);
  access policy policy3 allow delete using (...even more logic...);
  # Each policy adds query overhead
}
```

### 10. **Union Types are Optimized (Use Them!)**

**✅ Modern GEL Supports Union Types Well:**
```edgeql
# ✅ Efficient polymorphic links
type Movie {
  multi characters: Hero | Villain | Civilian;
}

# ✅ Efficient queries with type filtering
select Movie {
  title,
  heroes := .characters[is Hero],
  villains := .characters[is Villain]
}
```

---

## 🚀 **Production Deployment Patterns**

### 11. **Migration-Safe Schema Evolution**

**✅ Backward-Compatible Changes:**
```edgeql
type Contact {
  # ✅ Add optional fields safely
  customer_tier: str;  # Can be added without breaking existing data
  
  # ✅ Computed fields for backward compatibility
  fullname := .full_name;  # Legacy field as computed
}
```

**✅ Deprecation Pattern:**
```edgeql
type Contact {
  # Legacy fields marked for removal
  legacy_phone: str {
    annotation deprecated := 'Use primary_phone instead. Will be removed in v2.0';
  };
  
  # New normalized field
  primary_phone: str;
}
```

### 12. **Performance Monitoring**

**✅ Use GEL's Built-in Monitoring:**
```edgeql
# Monitor slow queries
select sys::QueryStats {
  query_text,
  total_time,
  calls
} 
filter .total_time > 1000  # Queries over 1 second
order by .total_time desc;
```

**✅ Set Up Query Performance Baselines:**
```python
# Example monitoring setup
def establish_performance_baselines():
    dashboard_queries = [
        "select ConversationSummary {...}",
        "select Person[is SystemUser] {...}",
        "select IncidentSummary {...}"
    ]
    
    for query in dashboard_queries:
        measure_and_record_baseline(query)
```

---

## 📋 **Quick Reference Checklist**

### Schema Design
- [ ] Use single links + computed backlinks for one-to-many
- [ ] Leverage inheritance for polymorphic entities
- [ ] Avoid unnecessary link properties
- [ ] Choose arrays vs multi properties based on access patterns
- [ ] Index only frequently filtered/ordered fields

### Query Performance  
- [ ] Use nested object queries instead of multiple requests
- [ ] Leverage polymorphic querying with `[is Type]`
- [ ] Monitor slow queries with `sys::QueryStats`
- [ ] Test migration performance with realistic data volumes

### Production Readiness
- [ ] Implement backward-compatible schema changes
- [ ] Document deprecation timelines
- [ ] Set up performance monitoring
- [ ] Plan for multiple role inheritance patterns

---

## 🎯 **Real-World Example: AFCA Person Hierarchy**

Our production implementation demonstrates these best practices:

```edgeql
# ✅ Perfect inheritance hierarchy
abstract type Person extending default::Timestamped {
  # Common fields all people share
  first_name: str;
  middle_name: str;
  last_name: str;
  full_name := .first_name ++ ((' ' ++ .middle_name) if exists .middle_name else '') ++ (' ' ++ .last_name);
  email: str;
  primary_phone: str;
  mobile_phone: str;
}

# ✅ Specific roles inherit cleanly
type SystemUser extending Person {
  required system_user_id: uuid { constraint exclusive; };
  department: str;
}

type Contact extending Person {
  required contactid: uuid { constraint exclusive; };
  customer_since: datetime;
}

# ✅ Multiple roles handled naturally
type SystemUserContact extending Person {
  required system_user_id: uuid { constraint exclusive; };
  required contactid: uuid { constraint exclusive; };
  department: str;
  customer_since: datetime;
}

# ✅ Single polymorphic link in AI analysis
type SpeakerLabel {
  speaker_identity: Person;  # Clean, performant, type-safe
}
```

**Result:** Clean schema, excellent performance, handles complex business requirements naturally.

## 🔍 **Type Intersections and Safety (`[is Type]` Syntax)**

### 13. **Master Type Intersections for Backlinks and Polymorphic Queries**

**✅ Essential for Typed Backlinks:**
```edgeql
type Contact {
  # ❌ This fails - EdgeQL doesn't know what type objects have owner_system_user
  multi phone_calls := .<owner_system_user;  # ❌ Can't access .createdon
  
  # ✅ This works - EdgeQL knows these are ExpandedPhoneCall objects
  multi phone_calls := .<owner_system_user[is ExpandedPhoneCall];  # ✅ Can access .createdon
}

# Now this works in queries:
select Contact {
  phone_call_count := count(.phone_calls),
  last_call_date := max(.phone_calls.createdon)  # ✅ Type-safe property access
}
```

**✅ Polymorphic Query Filtering:**
```edgeql
# Filter polymorphic links by specific subtypes
select Movie {
  title,
  heroes := .characters[is Hero],      # Only Hero characters
  villains := .characters[is Villain], # Only Villain characters
  hero_count := count(.characters[is Hero])
}
```

**✅ Conditional Property Access:**
```edgeql
select Person {
  full_name,
  employee_id := [is SystemUser].system_user_id,     # Only for employees
  customer_since := [is Contact].customer_since,     # Only for customers
  # Both fields for dual-role people:
  [is SystemUserContact] { system_user_id, contactid }
}
```

### **Common Type Intersection Pitfalls & Solutions**

**❌ Recursive Backlink Definition:**
```edgeql
type Contact {
  # ❌ BAD - Creates recursive definition
  multi regardingobjectid_contact_phonecall := .<regardingobjectid_contact_phonecall;
}
```

**✅ Proper Backlink Naming:**
```edgeql
type Contact {
  # ✅ GOOD - Different name, clear type intersection
  multi phone_calls := .<regardingobjectid_contact_phonecall[is ExpandedPhoneCall];
}
```

**❌ Missing Type Intersection:**
```edgeql
# ❌ This gives "std::BaseObject has no property 'createdon'" error
last_call := max(.<owner_system_user.createdon)
```

**✅ Explicit Type Intersection:**
```edgeql
# ✅ This works - EdgeQL knows the type
last_call := max(.<owner_system_user[is ExpandedPhoneCall].createdon)
```

### **Type Intersection Performance Notes**

- **Zero Performance Cost**: `[is Type]` is compile-time type checking, not runtime filtering
- **Enables Optimizations**: EdgeQL can optimize queries better with explicit types
- **Index Usage**: Properly typed backlinks can use indexes effectively
- **SQL Compilation**: Better SQL generation for joined queries

### **Quick Type Intersection Checklist**

- [ ] All backlinks use `[is SpecificType]` syntax
- [ ] Polymorphic queries filter with `[is Type]` when needed  
- [ ] No recursive backlink definitions (different names for forward/back)
- [ ] Type intersections used for conditional property access
- [ ] Complex inheritance hierarchies leverage `[is Type]` for precision